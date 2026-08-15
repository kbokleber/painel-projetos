function emptyForm() {
  return {
    id: '',
    version: 0,
    name: '',
    slug: '',
    description: '',
    clientArea: '',
    status: 'BACKLOG',
    priority: 'MEDIA',
    plannedStartDate: '',
    dueDate: '',
    actualEndDate: '',
    responsibleTeamText: '',
    technologyStackText: '',
    repositoryUrl: '',
    productionUrl: '',
    health: 'VERDE',
    healthReason: '',
    notes: '',
  };
}

function optional(value) {
  const normalized = typeof value === 'string' ? value.trim() : value;
  return normalized || null;
}

function splitList(value) {
  const seen = new Set();
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLocaleLowerCase('pt-BR');
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function errorMessage(data, fallback) {
  if (typeof data?.error === 'string') return data.error;
  if (typeof data?.error?.message === 'string') return data.error.message;
  return fallback;
}

export function registerProjectsPage(Alpine, requestCsrfToken) {
  Alpine.data('projectsPage', () => ({
    user: null,
    csrfToken: '',
    projects: [],
    loading: true,
    saving: false,
    error: '',
    success: '',
    formOpen: false,
    form: emptyForm(),
    stats: { total: 0, inProgress: 0, critical: 0, redHealth: 0 },
    filters: {
      search: '',
      status: '',
      clientArea: '',
      responsible: '',
      priority: '',
      periodFrom: '',
      periodTo: '',
      archived: 'exclude',
    },
    page: 1,
    pageSize: 20,
    total: 0,

    get userLabel() {
      return this.user ? `${this.user.username} · ${this.user.role}` : '';
    },
    get isAdmin() {
      return this.user?.role === 'ADMIN';
    },
    get showEmpty() {
      return !this.loading && this.projects.length === 0;
    },
    get showTable() {
      return !this.loading && this.projects.length > 0;
    },
    get showPagination() {
      return this.total > this.pageSize;
    },
    get isFirstPage() {
      return this.page <= 1;
    },
    get isLastPage() {
      return this.page * this.pageSize >= this.total;
    },
    get paginationLabel() {
      if (!this.total) return '0 projetos';
      const start = (this.page - 1) * this.pageSize + 1;
      const end = Math.min(this.page * this.pageSize, this.total);
      return `${start}–${end} de ${this.total}`;
    },
    get formTitle() {
      return this.form.id ? `Editar ${this.form.name}` : 'Novo projeto';
    },

    async init() {
      try {
        const [meResponse, csrfToken] = await Promise.all([
          fetch('/auth/me', { credentials: 'same-origin' }),
          requestCsrfToken(),
        ]);
        if (meResponse.status === 401) {
          window.location.assign('/login');
          return;
        }
        if (!meResponse.ok) throw new Error('Não foi possível carregar o usuário.');
        this.user = (await meResponse.json()).user;
        this.csrfToken = csrfToken;
        this.readFiltersFromUrl();
        await Promise.all([this.loadProjects(), this.loadStats()]);
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Não foi possível carregar projetos.';
        this.loading = false;
      }
    },

    readFiltersFromUrl() {
      const params = new URLSearchParams(window.location.search);
      for (const key of Object.keys(this.filters)) {
        if (params.has(key)) this.filters[key] = params.get(key) || '';
      }
      const page = Number(params.get('page'));
      if (Number.isInteger(page) && page > 0) this.page = page;
    },

    queryString() {
      const params = new URLSearchParams();
      params.set('page', String(this.page));
      params.set('pageSize', String(this.pageSize));
      for (const [key, value] of Object.entries(this.filters)) {
        if (value && !(key === 'archived' && value === 'exclude')) params.set(key, value);
      }
      return params;
    },

    async loadProjects() {
      this.loading = true;
      this.error = '';
      const params = this.queryString();
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
      try {
        const response = await fetch(`/api/projects?${params.toString()}`, {
          credentials: 'same-origin',
        });
        if (response.status === 401) {
          window.location.assign('/login');
          return;
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(errorMessage(data, 'Não foi possível listar projetos.'));
        this.projects = data.items || data.projects || [];
        this.total = data.total || 0;
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Não foi possível listar projetos.';
      } finally {
        this.loading = false;
      }
    },

    async loadStats() {
      try {
        const response = await fetch('/api/projects/stats', { credentials: 'same-origin' });
        if (!response.ok) return;
        const data = await response.json();
        this.stats = {
          total: data.total || 0,
          inProgress: data.inProgress || data.byStatus?.EM_ANDAMENTO || 0,
          critical: data.critical || data.byPriority?.CRITICA || 0,
          redHealth: data.redHealth || data.byHealth?.VERMELHO || 0,
        };
      } catch {
        // Estatísticas são complementares; a listagem permanece utilizável.
      }
    },

    async applyFilters() {
      this.page = 1;
      await this.loadProjects();
    },

    async clearFilters() {
      this.filters = {
        search: '',
        status: '',
        clientArea: '',
        responsible: '',
        priority: '',
        periodFrom: '',
        periodTo: '',
        archived: 'exclude',
      };
      this.page = 1;
      await this.loadProjects();
    },

    async previousPage() {
      if (this.isFirstPage) return;
      this.page -= 1;
      await this.loadProjects();
    },

    async nextPage() {
      if (this.isLastPage) return;
      this.page += 1;
      await this.loadProjects();
    },

    openCreate() {
      this.error = '';
      this.success = '';
      this.form = emptyForm();
      this.formOpen = true;
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    },

    async openEdit(event) {
      const id = event.currentTarget.dataset.id;
      this.error = '';
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
          credentials: 'same-origin',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(errorMessage(data, 'Não foi possível carregar o projeto.'));
        const project = data.project || data;
        this.form = {
          ...emptyForm(),
          ...project,
          description: project.description || '',
          clientArea: project.clientArea || '',
          plannedStartDate: project.plannedStartDate || '',
          dueDate: project.dueDate || '',
          actualEndDate: project.actualEndDate || '',
          responsibleTeamText: (project.responsibleTeam || []).join(', '),
          technologyStackText: (project.technologyStack || []).join(', '),
          repositoryUrl: project.repositoryUrl || '',
          productionUrl: project.productionUrl || '',
          healthReason: project.healthReason || '',
          notes: project.notes || '',
        };
        this.formOpen = true;
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      } catch (error) {
        this.error =
          error instanceof Error ? error.message : 'Não foi possível carregar o projeto.';
      }
    },

    closeForm() {
      this.formOpen = false;
      this.form = emptyForm();
    },

    projectPayload() {
      return {
        name: this.form.name,
        slug: this.form.slug,
        description: optional(this.form.description),
        clientArea: this.form.clientArea,
        status: this.form.status,
        priority: this.form.priority,
        plannedStartDate: optional(this.form.plannedStartDate),
        dueDate: optional(this.form.dueDate),
        actualEndDate: optional(this.form.actualEndDate),
        responsibleTeam: splitList(this.form.responsibleTeamText),
        technologyStack: splitList(this.form.technologyStackText),
        repositoryUrl: optional(this.form.repositoryUrl),
        productionUrl: optional(this.form.productionUrl),
        health: this.form.health,
        healthReason: optional(this.form.healthReason),
        notes: optional(this.form.notes),
      };
    },

    async saveProject() {
      this.saving = true;
      this.error = '';
      this.success = '';
      const editing = Boolean(this.form.id);
      const payload = this.projectPayload();
      if (editing) payload.version = this.form.version;
      try {
        const response = await fetch(editing ? `/api/projects/${this.form.id}` : '/api/projects', {
          method: editing ? 'PATCH' : 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': this.csrfToken,
          },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(errorMessage(data, 'Não foi possível salvar o projeto.'));
        this.success = editing ? 'Projeto atualizado.' : 'Projeto criado.';
        this.closeForm();
        await Promise.all([this.loadProjects(), this.loadStats()]);
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Não foi possível salvar o projeto.';
      } finally {
        this.saving = false;
      }
    },

    async mutateProject(id, action, version, successMessage) {
      this.error = '';
      this.success = '';
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(id)}/${action}`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': this.csrfToken,
          },
          body: JSON.stringify({ version }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(errorMessage(data, 'Não foi possível alterar o projeto.'));
        this.success = successMessage;
        await Promise.all([this.loadProjects(), this.loadStats()]);
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Não foi possível alterar o projeto.';
      }
    },

    async archiveProject(event) {
      const id = event.currentTarget.dataset.id;
      const project = this.projects.find((item) => item.id === id);
      if (!project || !window.confirm('Arquivar este projeto?')) return;
      await this.mutateProject(id, 'archive', project.version, 'Projeto arquivado.');
    },

    async restoreProject(event) {
      const id = event.currentTarget.dataset.id;
      const project = this.projects.find((item) => item.id === id);
      if (!project || !window.confirm('Restaurar este projeto?')) return;
      await this.mutateProject(id, 'restore', project.version, 'Projeto restaurado.');
    },

    async deleteProject(event) {
      const id = event.currentTarget.dataset.id;
      const project = this.projects.find((item) => item.id === id);
      if (!project || !this.isAdmin) return;
      if (
        !window.confirm('Excluir definitivamente este projeto? Esta ação não pode ser desfeita.')
      ) {
        return;
      }
      this.error = '';
      this.success = '';
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': this.csrfToken,
          },
          body: JSON.stringify({ version: project.version }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(errorMessage(data, 'Não foi possível excluir o projeto.'));
        }
        this.success = 'Projeto excluído definitivamente.';
        await Promise.all([this.loadProjects(), this.loadStats()]);
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Não foi possível excluir o projeto.';
      }
    },

    async logout() {
      try {
        await fetch('/auth/logout', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'x-csrf-token': this.csrfToken },
        });
      } finally {
        window.location.assign('/login');
      }
    },
  }));
}
