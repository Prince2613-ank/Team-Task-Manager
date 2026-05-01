import { z } from 'zod';

export const priorities = ['Low', 'Medium', 'High'];
export const statuses = ['To Do', 'In Progress', 'Done'];
export const roles = ['Admin', 'Member'];

const requiredString = (field, max) =>
  z.string({ required_error: `${field} is required` }).trim().min(1, `${field} is required`).max(max);

const dateString = z.string().trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be in YYYY-MM-DD format')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Due date is invalid');

export const signupSchema = z.object({
  name: requiredString('Name', 100),
  email: z.string().trim().email('Email is invalid').max(255).transform((email) => email.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128)
});

export const loginSchema = z.object({
  email: z.string().trim().email('Email is invalid').max(255).transform((email) => email.toLowerCase()),
  password: z.string().min(1, 'Password is required').max(128)
});

export const projectSchema = z.object({
  name: requiredString('Project name', 140),
  description: z.string().trim().max(2000).optional().default('')
});

export const joinProjectSchema = z.object({
  inviteCode: requiredString('Invite code', 16)
});

export const addMemberSchema = z.object({
  email: z.string().trim().email('Email is invalid').max(255).transform((email) => email.toLowerCase()),
  role: z.enum(roles).optional().default('Member')
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(roles)
});

export const taskSchema = z.object({
  title: requiredString('Task title', 180),
  description: z.string().trim().max(4000).optional().default(''),
  dueDate: dateString.nullable().optional(),
  priority: z.enum(priorities).optional().default('Medium'),
  status: z.enum(statuses).optional().default('To Do'),
  assignedTo: z.number().int().positive().nullable().optional()
});

export const updateTaskSchema = z.object({
  title: requiredString('Task title', 180).optional(),
  description: z.string().trim().max(4000).optional(),
  dueDate: dateString.nullable().optional(),
  priority: z.enum(priorities).optional(),
  status: z.enum(statuses).optional(),
  assignedTo: z.number().int().positive().nullable().optional()
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export function validate(schema, data) {
  return schema.parse(data);
}
