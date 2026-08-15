import { z } from 'zod';

export const PROJECT_STATUSES = [
  'BACKLOG',
  'PLANEJADO',
  'EM_ANDAMENTO',
  'PAUSADO',
  'CONCLUIDO',
  'CANCELADO',
] as const;
export const PROJECT_PRIORITIES = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] as const;
export const PROJECT_HEALTH_VALUES = ['VERDE', 'AMARELO', 'VERMELHO'] as const;

export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export const projectPrioritySchema = z.enum(PROJECT_PRIORITIES);
export const projectHealthSchema = z.enum(PROJECT_HEALTH_VALUES);

const isoDateSchema = z.iso.date();
const nullableDateSchema = isoDateSchema.nullable().optional();

function optionalHttpUrl() {
  return z
    .url()
    .max(2048)
    .refine((value) => {
      const protocol = new URL(value).protocol;
      return protocol === 'http:' || protocol === 'https:';
    }, 'A URL deve usar HTTP ou HTTPS.')
    .nullable()
    .optional();
}

function uniqueTrimmedStrings(maxItems: number) {
  return z
    .array(z.string().trim().min(1).max(120))
    .max(maxItems)
    .default([])
    .transform((values) => {
      const seen = new Set<string>();
      return values.filter((value) => {
        const key = value.toLocaleLowerCase('pt-BR');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
}

const projectInputShape = {
  name: z.string().trim().min(2).max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(180)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug inválido.'),
  description: z.string().trim().max(50_000).nullable().optional(),
  clientArea: z.string().trim().min(1).max(160),
  status: projectStatusSchema.default('BACKLOG'),
  priority: projectPrioritySchema.default('MEDIA'),
  plannedStartDate: nullableDateSchema,
  dueDate: nullableDateSchema,
  actualEndDate: nullableDateSchema,
  responsibleTeam: uniqueTrimmedStrings(100),
  technologyStack: uniqueTrimmedStrings(100),
  repositoryUrl: optionalHttpUrl(),
  productionUrl: optionalHttpUrl(),
  health: projectHealthSchema.default('VERDE'),
  healthReason: z.string().trim().max(2_000).nullable().optional(),
  notes: z.string().trim().max(50_000).nullable().optional(),
};

function validateDateOrder(
  value: {
    plannedStartDate?: string | null | undefined;
    dueDate?: string | null | undefined;
  },
  context: z.RefinementCtx,
) {
  if (value.plannedStartDate && value.dueDate && value.plannedStartDate > value.dueDate) {
    context.addIssue({
      code: 'custom',
      path: ['dueDate'],
      message: 'O prazo não pode ser anterior à data de início.',
    });
  }
}

export const createProjectSchema = z
  .strictObject(projectInputShape)
  .superRefine((value, context) => {
    validateDateOrder(value, context);
    if (value.health !== 'VERDE' && !value.healthReason) {
      context.addIssue({
        code: 'custom',
        path: ['healthReason'],
        message: 'Informe a justificativa da saúde do projeto.',
      });
    }
    if (value.status === 'CONCLUIDO' && !value.actualEndDate) {
      context.addIssue({
        code: 'custom',
        path: ['actualEndDate'],
        message: 'Informe a data real de conclusão.',
      });
    }
  });

const updateShape = Object.fromEntries(
  Object.entries(projectInputShape).map(([key, schema]) => [key, schema.optional()]),
) as { [Key in keyof typeof projectInputShape]: z.ZodOptional<(typeof projectInputShape)[Key]> };

export const updateProjectSchema = z
  .strictObject({
    ...updateShape,
    status: projectStatusSchema.optional(),
    priority: projectPrioritySchema.optional(),
    health: projectHealthSchema.optional(),
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

export const listProjectsQuerySchema = z
  .strictObject({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(160).optional(),
    status: csvEnum(PROJECT_STATUSES).optional(),
    priority: csvEnum(PROJECT_PRIORITIES).optional(),
    clientArea: z.string().trim().max(160).optional(),
    responsible: z.string().trim().max(120).optional(),
    periodFrom: isoDateSchema.optional(),
    periodTo: isoDateSchema.optional(),
    archived: z.enum(['exclude', 'only', 'include']).default('exclude'),
    sort: z.enum(['name', 'priority', 'dueDate', 'health', 'updatedAt']).default('updatedAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .superRefine((value, context) => {
    if (value.periodFrom && value.periodTo && value.periodFrom > value.periodTo) {
      context.addIssue({
        code: 'custom',
        path: ['periodTo'],
        message: 'O fim do período não pode ser anterior ao início.',
      });
    }
  });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
