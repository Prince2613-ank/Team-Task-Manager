import { query } from './db.js';
import { forbidden, notFound } from './errors.js';

export async function getMembership(userId, projectId) {
  const { rows } = await query(
    `
      SELECT
        p.id AS "projectId",
        p.name,
        p.description,
        p.invite_code AS "inviteCode",
        p.created_by AS "createdBy",
        pm.role
      FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
      WHERE p.id = $1 AND pm.user_id = $2
    `,
    [projectId, userId]
  );

  return rows[0] || null;
}

export async function requireProjectMember(userId, projectId) {
  const membership = await getMembership(userId, projectId);

  if (!membership) {
    throw forbidden('You are not a member of this project');
  }

  return membership;
}

export async function requireProjectAdmin(userId, projectId) {
  const membership = await requireProjectMember(userId, projectId);

  if (membership.role !== 'Admin') {
    throw forbidden('Only project admins can perform this action');
  }

  return membership;
}

export async function ensureProjectExists(projectId) {
  const { rows } = await query('SELECT id FROM projects WHERE id = $1', [projectId]);

  if (!rows.length) {
    throw notFound('Project not found');
  }
}
