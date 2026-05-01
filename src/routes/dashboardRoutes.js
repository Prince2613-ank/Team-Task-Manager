import express from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { requireProjectMember } from '../projectAccess.js';
import { statuses } from '../validators.js';

export const dashboardRouter = express.Router();

dashboardRouter.use(requireAuth);

function zeroStatusCounts() {
  return statuses.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {});
}

dashboardRouter.get('/projects/:projectId/dashboard', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const membership = await requireProjectMember(req.user.id, projectId);
    const scopeParams = [projectId];
    let memberScope = '';

    if (membership.role !== 'Admin') {
      scopeParams.push(req.user.id);
      memberScope = `AND t.assigned_to = $${scopeParams.length}`;
    }

    const [{ rows: totals }, { rows: byStatusRows }, { rows: perUserRows }, { rows: overdueRows }] =
      await Promise.all([
        query(
          `
            SELECT
              COUNT(*)::int AS "totalTasks",
              COUNT(CASE WHEN t.due_date < CURRENT_DATE AND t.status <> 'Done' THEN 1 END)::int AS "overdueCount"
            FROM tasks t
            WHERE t.project_id = $1
            ${memberScope}
          `,
          scopeParams
        ),
        query(
          `
            SELECT t.status, COUNT(*)::int AS count
            FROM tasks t
            WHERE t.project_id = $1
            ${memberScope}
            GROUP BY t.status
          `,
          scopeParams
        ),
        query(
          `
            SELECT
              COALESCE(u.id, 0) AS "userId",
              COALESCE(u.name, 'Unassigned') AS name,
              COUNT(t.id)::int AS count
            FROM tasks t
            LEFT JOIN users u ON u.id = t.assigned_to
            WHERE t.project_id = $1
            ${memberScope}
            GROUP BY u.id, u.name
            ORDER BY count DESC, name ASC
          `,
          scopeParams
        ),
        query(
          `
            SELECT
              t.id,
              t.title,
              TO_CHAR(t.due_date, 'YYYY-MM-DD') AS "dueDate",
              t.status,
              t.priority,
              u.name AS "assignedName"
            FROM tasks t
            LEFT JOIN users u ON u.id = t.assigned_to
            WHERE t.project_id = $1
              AND t.due_date < CURRENT_DATE
              AND t.status <> 'Done'
              ${memberScope}
            ORDER BY t.due_date ASC
            LIMIT 8
          `,
          scopeParams
        )
      ]);

    const byStatus = zeroStatusCounts();
    for (const row of byStatusRows) {
      byStatus[row.status] = row.count;
    }

    res.json({
      dashboard: {
        totalTasks: totals[0].totalTasks,
        byStatus,
        perUser: perUserRows,
        overdueCount: totals[0].overdueCount,
        overdueTasks: overdueRows
      }
    });
  } catch (error) {
    next(error);
  }
});

dashboardRouter.get('/dashboard', async (req, res, next) => {
  try {
    const { rows } = await query(
      `
        SELECT
          COUNT(t.id)::int AS "totalTasks",
          COUNT(CASE WHEN t.status = 'Done' THEN 1 END)::int AS "doneTasks",
          COUNT(CASE WHEN t.due_date < CURRENT_DATE AND t.status <> 'Done' THEN 1 END)::int AS "overdueTasks"
        FROM project_members pm
        JOIN tasks t ON t.project_id = pm.project_id
        WHERE pm.user_id = $1
          AND (pm.role = 'Admin' OR t.assigned_to = $1)
      `,
      [req.user.id]
    );

    res.json({ dashboard: rows[0] });
  } catch (error) {
    next(error);
  }
});
