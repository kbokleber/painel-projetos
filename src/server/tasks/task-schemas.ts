import { z } from 'zod';

export const TASK_STATUSES = [
  'PENDENTE',
  'EM_ANDAMENTO',
  'BLOQUEADA',
  'CONCLUIDA',
  'CANCELADA',
] as const;
export const TASK_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;

export const taskStatusSchema = z.enum(TASK_STATUSES);
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);

const isoDateSchema = z.iso.date();
const nullableDateSchema = isoDateSchema.nullable().optional();

const taskInputShape = {
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(50_000).nullable().optional(),
  status: taskStatusSchema.default('PENDENTE'),
  priority: taskPrioritySchema.default('P2'),
  assignee: z.string().trim().min(1).max(80).nullable().optional(),
  plannedStartDate: nullableDateSchema,
  dueDate: nullableDateSchema,
  position: z.number().int().min(0).default(0),
};

function validateDateOrder(
  value: {
    plannedStartDate?: string | null | undefined;
    dueDate?: string | null | undefined;
  },
  context: z.RefinementCtx,
): void {
  if (value.plannedStartDate && value.dueDate && value.plannedStartDate > value.dueDate) {
    context.addIssue({
      code: 'custom',
      path: ['dueDate'],
      message: 'O prazo não pode ser anterior à data de início.',
    });
  }
}

export const createTaskSchema = z
  .strictObject(taskInputShape)
  .superRefine((value, context) => validateDateOrder(value, context));

const updateShape = Object.fromEntries(
  Object.entries(taskInputShape).map(([key, schema]) => [key, schema.optional()]),
) as { [Key in keyof typeof taskInputShape]: z.ZodOptional<(typeof taskInputShape)[Key]> };

export const updateTaskSchema = z
  .strictObject({
    ...updateShape,
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    position: z.number().int().min(0).optional(),
    version: z.number().int().positive(),
  })
  .superRefine((value, context) => {
    if (Object.keys(value).every((key) => key === 'version')) {
      context.addIssue({ code: 'custom', message: 'Informe ao menos um campo para atualização.' });
    }
    validateDateOrder(value, context);
  });

function csvEnum<T extends readonly [string, ...string[]]>(values: T) {
  const itemSchema = z.enum(values);
  return z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .pipe(z.array(itemSchema).min(1));
}

export const listTasksQuerySchema = z
  .strictObject({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(200).optional(),
    status: csvEnum(TASK_STATUSES).optional(),
    priority: csvEnum(TASK_PRIORITIES).optional(),
    assignee: z.string().trim().max(80).optional(),
    dueFrom: isoDateSchema.optional(),
    dueTo: isoDateSchema.optional(),
    sort: z.enum(['position', 'priority', 'dueDate', 'createdAt', 'updatedAt']).default('position'),
    order: z.enum(['asc', 'desc']).default('asc'),
  })
  .superRefine((value, context) => {
    if (value.dueFrom && value.dueTo && value.dueFrom > value.dueTo) {
      context.addIssue({
        code: 'custom',
        path: ['dueTo'],
        message: 'O fim do prazo não pode ser anterior ao início.',
      });
    }
  });

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
