import crypto from 'node:crypto';
import express from 'express';
import { query, transaction } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, badRequest, forbidden, notFound } from '../errors.js';
import { requireProjectAdmin, requireProjectMember } from '../projectAccess.js';
import {
  addMemberSchema,
  joinProjectSchema,
  projectSchema,
  updateMemberRoleSchema,
  validate
} from '../validators.js';

export const projectRouter = express.Router();

projectRouter.use(requireAuth);

function toProject(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    inviteCode: row.inviteCode,
    role: row.role,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    memberCount: Number(row.memberCount || 0),
    totalTasks: Number(row.totalTasks || 0),
    doneTasks: Number(row.doneTasks || 0)
  };
}

async function createInviteCode(client) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const { rows } = await client.query('SELECT id FROM projects WHERE invite_code = $1', [code]);

    if (!rows.length) {
      return code;
    }
  }

  throw new HttpError(500, 'Could not generate an invite code');
}

projectRouter.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `
        SELECT
          p.id,
          p.name,
          p.description,
          p.invite_code AS "inviteCode",
          p.created_by AS "createdBy",
          p.created_at AS "createdAt",
          pm.role,
          COUNT(DISTINCT members.user_id) AS "memberCount",
          COUNT(DISTINCT t.id) AS "totalTasks",
          COUNT(DISTINCT CASE WHEN t.status = 'Done' THEN t.id END) AS "doneTasks"
        FROM projects p
        JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
        LEFT JOIN project_members members ON members.project_id = p.id
        LEFT JOIN tasks t ON t.project_id = p.id
        GROUP BY p.id, pm.role
        ORDER BY p.created_at DESC
      `,
      [req.user.id]
    );

    res.json({ projects: rows.map(toProject) });
  } catch (error) {
    next(error);
  }
});

projectRouter.post('/', async (req, res, next) => {
  try {
    const data = validate(projectSchema, req.body);
    const project = await transaction(async (client) => {
      const inviteCode = await createInviteCode(client);
      const { rows } = await client.query(
        `
          INSERT INTO projects (name, description, invite_code, created_by)
          VALUES ($1, $2, $3, $4)
          RETURNING id, name, description, invite_code AS "inviteCode", created_by AS "createdBy", created_at AS "createdAt"
        `,
        [data.name, data.description, inviteCode, req.user.id]
      );

      await client.query(
        'INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)',
        [rows[0].id, req.user.id, 'Admin']
      );

      return { ...rows[0], role: 'Admin', memberCount: 1, totalTasks: 0, doneTasks: 0 };
    });

    res.status(201).json({ project: toProject(project) });
  } catch (error) {
    next(error);
  }
});

projectRouter.post('/join', async (req, res, next) => {
  try {
    const data = validate(joinProjectSchema, req.body);
    const { rows } = await query(
      'SELECT id FROM projects WHERE invite_code = $1',
      [data.inviteCode.toUpperCase()]
    );

    if (!rows.length) {
      throw notFound('Project invite code was not found');
    }

    const projectId = rows[0].id;
    await query(
      `
        INSERT INTO project_members (project_id, user_id, role)
        VALUES ($1, $2, 'Member')
        ON CONFLICT (project_id, user_id) DO NOTHING
      `,
      [projectId, req.user.id]
    );

    const { rows: projectRows } = await query(
      `
        SELECT
          p.id,
          p.name,
          p.description,
          p.invite_code AS "inviteCode",
          p.created_by AS "createdBy",
          p.created_at AS "createdAt",
          pm.role,
          COUNT(DISTINCT members.user_id) AS "memberCount",
          COUNT(DISTINCT t.id) AS "totalTasks",
          COUNT(DISTINCT CASE WHEN t.status = 'Done' THEN t.id END) AS "doneTasks"
        FROM projects p
        JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
        LEFT JOIN project_members members ON members.project_id = p.id
        LEFT JOIN tasks t ON t.project_id = p.id
        WHERE p.id = $1
        GROUP BY p.id, pm.role
      `,
      [projectId, req.user.id]
    );

    res.json({ project: toProject(projectRows[0]) });
  } catch (error) {
    next(error);
  }
});

projectRouter.get('/:projectId', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const membership = await requireProjectMember(req.user.id, projectId);
    const { rows: members } = await query(
      `
        SELECT
          u.id,
          u.name,
          u.email,
          pm.role,
          pm.joined_at AS "joinedAt",
          COUNT(t.id) AS "assignedTasks"
        FROM project_members pm
        JOIN users u ON u.id = pm.user_id
        LEFT JOIN tasks t ON t.project_id = pm.project_id AND t.assigned_to = u.id
        WHERE pm.project_id = $1
        GROUP BY u.id, pm.role, pm.joined_at
        ORDER BY pm.role ASC, u.name ASC
      `,
      [projectId]
    );

    res.json({
      project: {
        id: membership.projectId,
        name: membership.name,
        description: membership.description,
        inviteCode: membership.inviteCode,
        role: membership.role,
        createdBy: membership.createdBy
      },
      members: members.map((member) => ({
        ...member,
        assignedTasks: Number(member.assignedTasks || 0)
      }))
    });
  } catch (error) {
    next(error);
  }
});

projectRouter.post('/:projectId/members', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    await requireProjectAdmin(req.user.id, projectId);
    const data = validate(addMemberSchema, req.body);

    const { rows: userRows } = await query(
      'SELECT id, name, email FROM users WHERE email = $1',
      [data.email]
    );

    if (!userRows.length) {
      throw notFound('No registered user exists with that email');
    }

    const user = userRows[0];
    await query(
      `
        INSERT INTO project_members (project_id, user_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (project_id, user_id)
        DO UPDATE SET role = EXCLUDED.role
      `,
      [projectId, user.id, data.role]
    );

    res.status(201).json({
      member: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: data.role,
        assignedTasks: 0
      }
    });
  } catch (error) {
    next(error);
  }
});

projectRouter.put('/:projectId/members/:userId', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const userId = Number(req.params.userId);
    await requireProjectAdmin(req.user.id, projectId);
    const data = validate(updateMemberRoleSchema, req.body);

    const result = await transaction(async (client) => {
      const { rows } = await client.query(
        'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
        [projectId, userId]
      );

      if (!rows.length) {
        throw notFound('Project member not found');
      }

      if (rows[0].role === 'Admin' && data.role === 'Member') {
        const { rows: admins } = await client.query(
          "SELECT COUNT(*)::int AS count FROM project_members WHERE project_id = $1 AND role = 'Admin'",
          [projectId]
        );

        if (admins[0].count <= 1) {
          throw forbidden('A project must have at least one admin');
        }
      }

      const { rows: updated } = await client.query(
        `
          UPDATE project_members
          SET role = $3
          WHERE project_id = $1 AND user_id = $2
          RETURNING user_id AS id, role
        `,
        [projectId, userId, data.role]
      );

      return updated[0];
    });

    res.json({ member: result });
  } catch (error) {
    next(error);
  }
});

projectRouter.delete('/:projectId/members/:userId', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const userId = Number(req.params.userId);
    await requireProjectAdmin(req.user.id, projectId);

    if (userId === req.user.id) {
      throw badRequest('Admins cannot remove themselves from a project');
    }

    await transaction(async (client) => {
      const { rows } = await client.query(
        'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
        [projectId, userId]
      );

      if (!rows.length) {
        throw notFound('Project member not found');
      }

      if (rows[0].role === 'Admin') {
        const { rows: admins } = await client.query(
          "SELECT COUNT(*)::int AS count FROM project_members WHERE project_id = $1 AND role = 'Admin'",
          [projectId]
        );

        if (admins[0].count <= 1) {
          throw forbidden('A project must have at least one admin');
        }
      }

      await client.query(
        'UPDATE tasks SET assigned_to = NULL WHERE project_id = $1 AND assigned_to = $2',
        [projectId, userId]
      );
      await client.query(
        'DELETE FROM project_members WHERE project_id = $1 AND user_id = $2',
        [projectId, userId]
      );
    });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
