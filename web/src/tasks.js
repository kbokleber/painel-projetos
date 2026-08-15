import { csrf, apiError } from './main.js';
const statuses = ['PENDENTE', 'EM_ANDAMENTO', 'BLOQUEADA', 'CONCLUIDA', 'CANCELADA'];
const blank = () => ({
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
});
const nullable = (v) => String(v || '').trim() || null;
export function registerTasksPage(Alpine, shared) {
  Alpine.data('tasksPage', () => ({
    ...shared(),
    project: null,
    user: null,
    tasks: [],
    csrfToken: '',
    loading: true,
    saving: false,
    error: '',
    formError: '',
    formOpen: false,
    lastFocusedElement: null,
    view: 'kanban',
    search: '',
    status: '',
    priority: '',
    assignee: '',
    draggedId: '',
    form: blank(),
    statuses,
    get projectId() {
      const p = location.pathname.split('/').filter(Boolean);
      return p[0] === 'projects' ? p[1] : new URLSearchParams(location.search).get('id') || '';
    },
    get archived() {
      return Boolean(this.project?.archivedAt);
    },
    get assignees() {
      return [...new Set(this.tasks.map((t) => t.assignee).filter(Boolean))];
    },
    async init() {
      try {
        const id = this.projectId;
        const [me, token, p] = await Promise.all([
          fetch('/auth/me'),
          csrf(),
          fetch(`/api/projects/${encodeURIComponent(id)}`),
        ]);
        if (me.status === 401) {
          location.assign('/login');
          return;
        }
        if (!p.ok) await apiError(p, 'Projeto não encontrado.');
        this.user = (await me.json()).user;
        this.csrfToken = token;
        this.project = await p.json();
        await this.loadTasks();
      } catch (e) {
        this.error = e.message || 'Não foi possível carregar as tarefas.';
      } finally {
        this.loading = false;
      }
    },
    async loadTasks() {
      this.loading = true;
      const p = new URLSearchParams({ pageSize: '100', sort: 'position', order: 'asc' });
      if (this.search.trim()) p.set('search', this.search.trim());
      if (this.status) p.set('status', this.status);
      if (this.priority) p.set('priority', this.priority);
      if (this.assignee) p.set('assignee', this.assignee);
      try {
        const r = await fetch(`/api/projects/${this.projectId}/tasks?${p}`);
        if (!r.ok) await apiError(r, 'Não foi possível carregar as tarefas.');
        this.tasks = (await r.json()).items || [];
      } finally {
        this.loading = false;
      }
    },
    tasksFor(status) {
      return this.tasks.filter((t) => t.status === status);
    },
    setKanban() {
      this.view = 'kanban';
    },
    setList() {
      this.view = 'list';
    },
    applyFilters() {
      return this.loadTasks();
    },
    clearFilters() {
      this.search = '';
      this.status = '';
      this.priority = '';
      this.assignee = '';
      return this.loadTasks();
    },
    focusForm() {
      setTimeout(() => document.querySelector('[data-task-title]')?.focus(), 0);
    },
    openCreate() {
      if (!this.archived) {
        this.lastFocusedElement = document.activeElement;
        this.form = blank();
        this.formOpen = true;
        this.focusForm();
      }
    },
    openEdit(e) {
      const t = this.tasks.find((x) => x.id === e.currentTarget.dataset.id);
      if (t && !this.archived) {
        this.lastFocusedElement = document.activeElement;
        this.form = {
          ...blank(),
          ...t,
          description: t.description || '',
          assignee: t.assignee || '',
          plannedStartDate: t.plannedStartDate || '',
          dueDate: t.dueDate || '',
        };
        this.formOpen = true;
        this.focusForm();
      }
    },
    closeForm() {
      this.formOpen = false;
      this.form = blank();
      const previous = this.lastFocusedElement;
      this.lastFocusedElement = null;
      setTimeout(() => previous?.focus(), 0);
    },
    handleModalKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeForm();
        return;
      }
      if (event.key !== 'Tab') return;
      const modal = event.currentTarget;
      const focusable = [
        ...modal.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    body() {
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
      this.formError = '';
      if (this.form.title.trim().length < 2) {
        this.formError = 'Informe um título com pelo menos 2 caracteres.';
        return;
      }
      this.saving = true;
      try {
        const edit = Boolean(this.form.id),
          body = this.body();
        if (edit) body.version = this.form.version;
        const url = edit
          ? `/api/projects/${this.projectId}/tasks/${this.form.id}`
          : `/api/projects/${this.projectId}/tasks`;
        const r = await fetch(url, {
          method: edit ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json', 'x-csrf-token': this.csrfToken },
          body: JSON.stringify(body),
        });
        if (!r.ok) await apiError(r, 'Não foi possível salvar a tarefa.');
        this.closeForm();
        this.showToast(edit ? 'Tarefa atualizada.' : 'Tarefa criada.');
        await this.loadTasks();
      } catch (e) {
        this.formError = e.message;
      } finally {
        this.saving = false;
      }
    },
    dragStart(e) {
      this.draggedId = e.currentTarget.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
    },
    dropTask(e) {
      e.preventDefault();
      const status = e.currentTarget.dataset.status;
      if (this.draggedId && status) this.changeStatus(this.draggedId, status);
      this.draggedId = '';
    },
    statusFromSelect(e) {
      this.changeStatus(e.currentTarget.dataset.id, e.currentTarget.value);
    },
    completeTask(e) {
      this.changeStatus(e.currentTarget.dataset.id, 'CONCLUIDA');
    },
    toggleComplete(e) {
      this.changeStatus(
        e.currentTarget.dataset.id,
        e.currentTarget.checked ? 'CONCLUIDA' : 'PENDENTE',
      );
    },
    async changeStatus(id, status) {
      const task = this.tasks.find((t) => t.id === id);
      if (!task || task.status === status || this.archived) return;
      const previous = task.status;
      task.status = status;
      try {
        const r = await fetch(`/api/projects/${this.projectId}/tasks/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', 'x-csrf-token': this.csrfToken },
          body: JSON.stringify({ status, version: task.version }),
        });
        if (r.status === 409) {
          await this.loadTasks();
          this.showToast('A tarefa foi alterada por outra pessoa. Lista atualizada.', 'error');
          return;
        }
        if (!r.ok) await apiError(r, 'Não foi possível mover a tarefa.');
        Object.assign(task, await r.json());
        this.showToast('Status atualizado.');
      } catch (e) {
        task.status = previous;
        this.showToast(e.message || 'Alteração desfeita.', 'error');
      }
    },
    async deleteTask(e) {
      const t = this.tasks.find((x) => x.id === e.currentTarget.dataset.id);
      if (!t || this.archived || !confirm('Excluir esta tarefa?')) return;
      try {
        const r = await fetch(`/api/tasks/${t.id}`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json', 'x-csrf-token': this.csrfToken },
          body: JSON.stringify({ version: t.version }),
        });
        if (!r.ok) await apiError(r, 'Não foi possível excluir.');
        this.showToast('Tarefa excluída.');
        await this.loadTasks();
      } catch (err) {
        this.error = err.message;
      }
    },
  }));
}
