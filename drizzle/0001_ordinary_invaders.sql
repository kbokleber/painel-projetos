CREATE TYPE "public"."project_health" AS ENUM('VERDE', 'AMARELO', 'VERMELHO');--> statement-breakpoint
CREATE TYPE "public"."project_priority" AS ENUM('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('BACKLOG', 'PLANEJADO', 'EM_ANDAMENTO', 'PAUSADO', 'CONCLUIDO', 'CANCELADO');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PROJECT_CREATED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PROJECT_UPDATED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PROJECT_ARCHIVED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PROJECT_RESTORED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PROJECT_DELETED';--> statement-breakpoint
CREATE SEQUENCE "public"."project_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) DEFAULT 'KBO-' || lpad(nextval('project_code_seq')::text, 3, '0') NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(180) NOT NULL,
	"description" text,
	"client_area" varchar(160) NOT NULL,
	"status" "project_status" DEFAULT 'BACKLOG' NOT NULL,
	"priority" "project_priority" DEFAULT 'MEDIA' NOT NULL,
	"planned_start_date" date,
	"due_date" date,
	"actual_end_date" date,
	"responsible_team" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"technology_stack" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"repository_url" varchar(2048),
	"production_url" varchar(2048),
	"health" "project_health" DEFAULT 'VERDE' NOT NULL,
	"health_reason" text,
	"notes" text,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_progress_range" CHECK ("projects"."progress_percent" between 0 and 100),
	CONSTRAINT "projects_planned_dates_order" CHECK ("projects"."planned_start_date" is null or "projects"."due_date" is null or "projects"."planned_start_date" <= "projects"."due_date")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_code_unique" ON "projects" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_slug_unique" ON "projects" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_priority_idx" ON "projects" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "projects_health_idx" ON "projects" USING btree ("health");--> statement-breakpoint
CREATE INDEX "projects_client_area_idx" ON "projects" USING btree ("client_area");--> statement-breakpoint
CREATE INDEX "projects_due_date_idx" ON "projects" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "projects_archived_at_idx" ON "projects" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "projects_updated_at_idx" ON "projects" USING btree ("updated_at");