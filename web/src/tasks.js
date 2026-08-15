function emptyTask() {
  return {
    id: '',
    version: 0,
    title: '',
    description: '',
    status: 'PENDENTE',
    priority: 'P2',
    assignee: '',
    plannedStartDate: '',
    dueDate: '',
    position: 0,
  };
}

function nullable(value) {
  const normalized = typeof value === 'string' ? value.trim() : value;
  return normalized || null;
}

function message(data, fallback) {
  return data && typeof data.error === 'string' ? data.error : fallback;
}

export function registerTasksPage(Alpine) {
  Alpine.data('tasksPage', () => ({
    projectId: '',
    project: null,
    user: null,
    tasks: [],
    csrfToken: '',
    search: '',
    status: '',
    loading: true,
    saving: false,
    formOpen: false,
    form: emptyTask(),
    error: '',
    success: '',

    get archived() {
      return Boolean(this.project && this.project.archivedAt);
    },

    get pageTitle() {
      return this.project ? `${this.project.code} · ${this.project.name}` : 'Tarefas';
    },

    async init() {
      const parts = window.location.pathname.split('/').filter(Boolean);
      this.projectId = parts[1] || '';
      if (!this.projectId) {
        this.error = 'Projeto inválido.';
        this.loading = false;
        return;
      }
      try {
        const [csrfResponse, userResponse, projectResponse] = await Promise.all([
          fetch('/auth/csrf', { credentials: 'same-origin' }),
          fetch('/auth/me', { credentials: 'same-origin' }),
          fetch(`/api/projects/${encodeURIComponent(this.projectId)}`, {
            credentials: 'same-origin',
          }),
        ]);
        if (userResponse.status === 401 || projectResponse.status === 401) {
          window.location.assign('/login');
          return;
        }
        const csrfData = await csrfResponse.json();
        const projectData = await projectResponse.json().catch(() => ({}));
        if (!projectResponse.ok) throw new Error(message(projectData, 'Projeto não encontrado.'));
        this.csrfToken = csrfData.csrfToken;
        this.user = await userResponse.json();
        this.project = projectData;
        await this.loadTasks();
      } catch (error) {
        this.error =
          error instanceof Error ? error.message : 'Não foi possível carregar as tarefas.';
      } finally {
        this.loading = false;
      }
    },

    async loadTasks() {
      const params = new URLSearchParams({ pageSize: '100', sort: 'position', order: 'asc' });
      if (this.search.trim()) params.set('search', this.search.trim());
      if (this.status) params.set('status', this.status);
      const response = await fetch(
        `/api/projects/${encodeURIComponent(this.projectId)}/tasks?${params.toString()}`,
        { credentials: 'same-origin' },
      );
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(message(data, 'Não foi possível carregar as tarefas.'));
      this.tasks = data.items;
    },

    async applyFilters() {
      this.error = '';
      try {
        await this.loadTasks();
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Não foi possível filtrar.';
      }
    },

    openCreate() {
      if (this.archived) return;
      this.form = emptyTask();
      this.formOpen = true;
      this.error = '';
    },

    openEdit(event) {
      const task = this.tasks.find((item) => item.id === event.currentTarget.dataset.id);
      if (!task || this.archived) return;
      this.form = {
        id: task.id,
        version: task.version,
        title: task.title,
        description: task.description || '',
        status: task.status,
        priority: task.priority,
        assignee: task.assignee || '',
        plannedStartDate: task.plannedStartDate || '',
        dueDate: task.dueDate || '',
        position: task.position,
      };
      this.formOpen = true;
      this.error = '';
    },

    closeForm() {
      this.formOpen = false;
      this.form = emptyTask();
    },

    payload() {
      return {
        title: this.form.title.trim(),
        description: nullable(this.form.description),
        status: this.form.status,
        priority: this.form.priority,
        assignee: nullable(this.form.assignee),
        plannedStartDate: nullable(this.form.plannedStartDate),
        dueDate: nullable(this.form.dueDate),
        position: Number(this.form.position),
      };
    },

    async saveTask() {
      this.saving = true;
      this.error = '';
      this.success = '';
      const editing = Boolean(this.form.id);
      const body = this.payload();
      if (editing) body.version = this.form.version;
      try {
        const response = await fetch(
          editing
            ? `/api/tasks/${encodeURIComponent(this.form.id)}`
            : `/api/projects/${encodeURIComponent(this.projectId)}/tasks`,
          {
            method: editing ? 'PATCH' : 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json', 'x-csrf-token': this.csrfToken },
            body: JSON.stringify(body),
          },
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(message(data, 'Não foi possível salvar a tarefa.'));
        this.success = editing ? 'Tarefa atualizada.' : 'Tarefa criada.';
        this.closeForm();
        await this.loadTasks();
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Não foi possível salvar a tarefa.';
      } finally {
        this.saving = false;
      }
    },

    async mutate(id, payload, method, successMessage) {
      this.error = '';
      this.success = '';
      const response = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
        method,
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': this.csrfToken },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(message(data, 'Não foi possível alterar a tarefa.'));
      }
      this.success = successMessage;
      await this.loadTasks();
    },

    async completeTask(event) {
      const task = this.tasks.find((item) => item.id === event.currentTarget.dataset.id);
      if (!task || this.archived) return;
      try {
        await this.mutate(
          task.id,
          { version: task.version, status: 'CONCLUIDA' },
          'PATCH',
          'Tarefa concluída.',
        );
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Não foi possível concluir.';
      }
    },

    async deleteTask(event) {
      const task = this.tasks.find((item) => item.id === event.currentTarget.dataset.id);
      if (!task || this.archived || !window.confirm('Excluir esta tarefa?')) return;
      try {
        await this.mutate(task.id, { version: task.version }, 'DELETE', 'Tarefa excluída.');
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Não foi possível excluir.';
      }
    },
  }));
}
