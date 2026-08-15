import { csrf, apiError } from './main.js';
export function registerProjectDetail(Alpine, shared) {
  Alpine.data('projectDetail', () => ({
    ...shared(),
    user: null,
    project: null,
    tasks: [],
    csrfToken: '',
    loading: true,
    error: '',
    activeTab: 'overview',
    get projectId() {
      const path = location.pathname.split('/').filter(Boolean);
      return path[0] === 'projects'
        ? path[1]
        : new URLSearchParams(location.search).get('id') || '';
    },
    get recentTasks() {
      return this.tasks.slice(0, 5);
    },
    tasksByStatus(status) {
      return this.tasks.filter((t) => t.status === status);
    },
    countByStatus(status) {
      return this.tasks.filter((t) => t.status === status).length;
    },
    async onDrop(event, newStatus) {
      const taskId = event.dataTransfer.getData('text/plain');
      const task = this.tasks.find((t) => t.id === taskId);
      if (!task || task.status === newStatus) return;
      const oldStatus = task.status;
      // Optimistic update
      task.status = newStatus;
      try {
        const csrfToken = await csrf();
        const res = await fetch(
          `/api/projects/${encodeURIComponent(this.projectId)}/tasks/${encodeURIComponent(taskId)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
            body: JSON.stringify({ status: newStatus, version: task.version }),
            credentials: 'same-origin',
          },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Falha ao mover a tarefa.');
        }
        const updated = await res.json();
        Object.assign(task, updated);
      } catch (err) {
        task.status = oldStatus;
        this.error = err.message;
        setTimeout(() => (this.error = ''), 5000);
      }
    },
    get isAdmin() {
      return this.user?.role === 'ADMIN';
    },
    async init() {
      await this.load();
    },
    async load() {
      this.loading = true;
      this.error = '';
      try {
        const id = this.projectId;
        const [me, token, p, t] = await Promise.all([
          fetch('/auth/me'),
          csrf(),
          fetch(`/api/projects/${encodeURIComponent(id)}`),
          fetch(
            `/api/projects/${encodeURIComponent(id)}/tasks?pageSize=100&sort=updatedAt&order=desc`,
          ),
        ]);
        if (me.status === 401) {
          location.assign('/login');
          return;
        }
        if (!p.ok) await apiError(p, 'Projeto não encontrado.');
        this.user = (await me.json()).user;
        this.csrfToken = token;
        this.project = await p.json();
        if (!t.ok) await apiError(t, 'Não foi possível carregar as tarefas recentes.');
        this.tasks = (await t.json()).items || [];
      } catch (e) {
        this.error = e.message || 'Não foi possível carregar o projeto.';
      } finally {
        this.loading = false;
      }
    },
    tabOverview() {
      this.activeTab = 'overview';
    },
    tabTasks() {
      this.activeTab = 'tasks';
    },
    tabReleases() {
      this.activeTab = 'releases';
    },
    tabNotes() {
      this.activeTab = 'notes';
    },
    editProject() {
      if (!this.isAdmin) return;
      location.assign(`/projects?edit=${encodeURIComponent(this.projectId)}`);
    },
    async setArchived(action) {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(this.projectId)}/${action}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-csrf-token': this.csrfToken },
          body: JSON.stringify({ version: this.project.version }),
        },
      );
      if (!response.ok) await apiError(response, 'Não foi possível alterar o projeto.');
      this.project = await response.json();
      this.showToast(action === 'archive' ? 'Projeto arquivado.' : 'Projeto restaurado.');
    },
    async archiveProject() {
      if (!this.project?.archivedAt && confirm('Arquivar este projeto?')) {
        try {
          await this.setArchived('archive');
        } catch (error) {
          this.showToast(error.message || 'Não foi possível arquivar.', 'error');
        }
      }
    },
    async restoreProject() {
      if (this.isAdmin && this.project?.archivedAt) {
        try {
          await this.setArchived('restore');
        } catch (error) {
          this.showToast(error.message || 'Não foi possível restaurar.', 'error');
        }
      }
    },
    async deleteProject() {
      if (!this.isAdmin || !this.project?.archivedAt) return;
      if (!confirm('Excluir definitivamente este projeto? Esta ação não pode ser desfeita.'))
        return;
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(this.projectId)}`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json', 'x-csrf-token': this.csrfToken },
          body: JSON.stringify({ version: this.project.version }),
        });
        if (!response.ok) await apiError(response, 'Não foi possível excluir o projeto.');
        location.assign('/projects');
      } catch (error) {
        this.showToast(error.message || 'Não foi possível excluir.', 'error');
      }
    },
  }));
}
