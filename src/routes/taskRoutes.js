import express from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import { requireProjectAdmin, requireProjectMember } from '../projectAccess.js';
import { taskSchema, updateTaskSchema, validate } from '../validators.js';

export const taskRouter = express.Router();

taskRouter.use(requireAuth);

function mapTask(row) {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    dueDate: row.dueDate,
    priority: row.priority,
    status: row.status,
    assignedTo: row.assignedTo,
    assignedName: row.assignedName,
    assignedEmail: row.assignedEmail,
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

const taskSelect = `
  SELECT
    t.id,
    t.project_id AS "projectId",
    t.title,
    t.description,
    TO_CHAR(t.due_date, 'YYYY-MM-DD') AS "dueDate",
    t.priority,
    t.status,
    t.assigned_to AS "assignedTo",
    assignee.name AS "assignedName",
    assignee.email AS "assignedEmail",
    t.created_by AS "createdBy",
    creator.name AS "createdByName",
    t.created_at AS "createdAt",
    t.updated_at AS "updatedAt"
  FROM tasks t
  LEFT JOIN users assignee ON assignee.id = t.assigned_to
  JOIN users creator ON creator.id = t.created_by
`;

async function ensureAssignableUser(projectId, assignedTo) {
  if (!assignedTo) {
    return;
  }

  const { rows } = await query(
    'SELECT user_id FROM project_members WHERE project_id = $1 AND user_id = $2',
    [projectId, assignedTo]
  );

  if (!rows.length) {
    throw badRequest('Assigned user must be a member of the project');
  }
}

async function getTaskForUser(taskId, userId) {
  const { rows } = await query(
    `
      ${taskSelect},
      project_members pm
      WHERE t.id = $1
        AND pm.project_id = t.project_id
        AND pm.user_id = $2
    `,
    [taskId, userId]
  );

  if (!rows.length) {
    throw notFound('Task not found');
  }

  return rows[0];
}

taskRouter.get('/projects/:projectId/tasks', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const membership = await requireProjectMember(req.user.id, projectId);
    const params = [projectId];
    let assignedScope = '';

    if (membership.role !== 'Admin') {
      params.push(req.user.id);
      assignedScope = `AND t.assigned_to = $${params.length}`;
    }

    const { rows } = await query(
      `
        ${taskSelect}
        WHERE t.project_id = $1
        ${assignedScope}
        ORDER BY
          CASE t.status
            WHEN 'To Do' THEN 1
            WHEN 'In Progress' THEN 2
            ELSE 3
          END,
          t.due_date NULLS LAST,
          t.updated_at DESC
      `,
      params
    );

    res.json({ tasks: rows.map(mapTask), role: membership.role });
  } catch (error) {
    next(error);
  }
});

taskRouter.post('/projects/:projectId/tasks', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    await requireProjectAdmin(req.user.id, projectId);
    const data = validate(taskSchema, req.body);
    await ensureAssignableUser(projectId, data.assignedTo);

    const { rows } = await query(
      `
        INSERT INTO tasks (project_id, title, description, due_date, priority, status, assigned_to, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `,
      [
        projectId,
        data.title,
        data.description,
        data.dueDate || null,
        data.priority,
        data.status,
        data.assignedTo || null,
        req.user.id
      ]
    );

    const task = await getTaskForUser(rows[0].id, req.user.id);
    res.status(201).json({ task: mapTask(task) });
  } catch (error) {
    next(error);
  }
});

taskRouter.put('/tasks/:taskId', async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const existing = await getTaskForUser(taskId, req.user.id);
    const membership = await requireProjectMember(req.user.id, existing.projectId);
    const data = validate(updateTaskSchema, req.body);
    const fields = Object.keys(data);

    if (membership.role !== 'Admin') {
      if (existing.assignedTo !== req.user.id) {
        throw forbidden('Members can only update tasks assigned to them');
      }

      if (fields.length !== 1 || fields[0] !== 'status') {
        throw forbidden('Members can only update the status of assigned tasks');
      }
    }

    if (Object.prototype.hasOwnProperty.call(data, 'assignedTo')) {
      await ensureAssignableUser(existing.projectId, data.assignedTo);
    }

    const columnMap = {
      title: 'title',
      description: 'description',
      dueDate: 'due_date',
      priority: 'priority',
      status: 'status',
      assignedTo: 'assigned_to'
    };
    const values = [];
    const assignments = fields.map((field, index) => {
      values.push(data[field] === undefined ? null : data[field]);
      return `${columnMap[field]} = $${index + 1}`;
    });
    values.push(taskId);

    await query(
      `
        UPDATE tasks
        SET ${assignments.join(', ')}
        WHERE id = $${values.length}
      `,
      values
    );

    const updated = await getTaskForUser(taskId, req.user.id);
    res.json({ task: mapTask(updated) });
  } catch (error) {
    next(error);
  }
});

taskRouter.delete('/tasks/:taskId', async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const task = await getTaskForUser(taskId, req.user.id);
    await requireProjectAdmin(req.user.id, task.projectId);
    await query('DELETE FROM tasks WHERE id = $1', [taskId]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
