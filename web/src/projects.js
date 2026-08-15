import { csrf, apiError } from './main.js';
const blank = () => ({
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
});
const nullable = (v) => String(v || '').trim() || null;
const list = (v) => [
  ...new Set(
    String(v || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  ),
];
export function registerProjectsPage(Alpine, shared) {
  Alpine.data('projectsPage', () => ({
    ...shared(),
    user: null,
    csrfToken: '',
    projects: [],
    loading: true,
    saving: false,
    error: '',
    formError: '',
    formOpen: false,
    lastFocusedElement: null,
    menuId: '',
    view: 'cards',
    form: blank(),
    filters: {
      search: '',
      status: '',
      clientArea: '',
      responsible: '',
      priority: '',
      health: '',
      periodFrom: '',
      periodTo: '',
      archived: 'exclude',
    },
    page: 1,
    pageSize: 20,
    total: 0,
    get isAdmin() {
      return this.user?.role === 'ADMIN';
    },
    get isFirstPage() {
      return this.page <= 1;
    },
    get isLastPage() {
      return this.page * this.pageSize >= this.total;
    },
    get hasProjects() {
      return !this.loading && this.projects.length > 0;
    },
    async init() {
      try {
        const [me, token] = await Promise.all([fetch('/auth/me'), csrf()]);
        if (me.status === 401) {
          location.assign('/login');
          return;
        }
        this.user = (await me.json()).user;
        this.csrfToken = token;
        const edit = new URLSearchParams(location.search).get('edit');
        this.readUrl();
        await this.load();
        if (edit && this.isAdmin) await this.openEditById(edit);
      } catch (e) {
        this.error = e.message || 'Não foi possível carregar projetos.';
        this.loading = false;
      }
    },
    readUrl() {
      const p = new URLSearchParams(location.search);
      Object.keys(this.filters).forEach((k) => {
        if (p.has(k)) this.filters[k] = p.get(k) || '';
      });
    },
    query() {
      const p = new URLSearchParams({ page: String(this.page), pageSize: String(this.pageSize) });
      Object.entries(this.filters).forEach(([k, v]) => {
        if (v && !(k === 'archived' && v === 'exclude')) p.set(k, v);
      });
      return p;
    },
    async load() {
      this.loading = true;
      this.error = '';
      try {
        const p = this.query();
        history.replaceState(null, '', `${location.pathname}?${p}`);
        const r = await fetch(`/api/projects?${p}`);
        if (!r.ok) await apiError(r, 'Não foi possível listar projetos.');
        const d = await r.json();
        this.projects = d.items || d.projects || [];
        this.total = d.total || 0;
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    },
    applyFilters() {
      this.page = 1;
      return this.load();
    },
    clearFilters() {
      this.filters = {
        search: '',
        status: '',
        clientArea: '',
        responsible: '',
        priority: '',
        health: '',
        periodFrom: '',
        periodTo: '',
        archived: 'exclude',
      };
      this.page = 1;
      return this.load();
    },
    setCards() {
      this.view = 'cards';
    },
    setTable() {
      this.view = 'table';
    },
    toggleMenu(e) {
      const id = e.currentTarget.dataset.id;
      this.menuId = this.menuId === id ? '' : id;
    },
    nextPage() {
      if (!this.isLastPage) {
        this.page++;
        return this.load();
      }
    },
    previousPage() {
      if (!this.isFirstPage) {
        this.page--;
        return this.load();
      }
    },
    focusForm() {
      setTimeout(() => document.querySelector('[data-project-name]')?.focus(), 0);
    },
    openCreate() {
      if (!this.isAdmin) return;
      this.lastFocusedElement = document.activeElement;
      this.form = blank();
      this.formError = '';
      this.formOpen = true;
      this.focusForm();
    },
    async openEdit(e) {
      if (!this.isAdmin) return;
      this.lastFocusedElement = document.activeElement;
      await this.openEditById(e.currentTarget.dataset.id);
    },
    async openEditById(id) {
      if (!this.isAdmin) return;
      try {
        const r = await fetch(`/api/projects/${encodeURIComponent(id)}`);
        if (!r.ok) await apiError(r, 'Não foi possível carregar o projeto.');
        const p = await r.json();
        this.form = {
          ...blank(),
          ...p,
          responsibleTeamText: (p.responsibleTeam || []).join(', '),
          technologyStackText: (p.technologyStack || []).join(', '),
        };
        this.formOpen = true;
        this.menuId = '';
        this.focusForm();
      } catch (e) {
        this.error = e.message;
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
      const focusable = [
        ...event.currentTarget.querySelectorAll(
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
    payload() {
      return {
        name: this.form.name.trim(),
        slug: this.form.slug.trim(),
        description: nullable(this.form.description),
        clientArea: this.form.clientArea.trim(),
        status: this.form.status,
        priority: this.form.priority,
        plannedStartDate: nullable(this.form.plannedStartDate),
        dueDate: nullable(this.form.dueDate),
        actualEndDate: nullable(this.form.actualEndDate),
        responsibleTeam: list(this.form.responsibleTeamText),
        technologyStack: list(this.form.technologyStackText),
        repositoryUrl: nullable(this.form.repositoryUrl),
        productionUrl: nullable(this.form.productionUrl),
        health: this.form.health,
        healthReason: nullable(this.form.healthReason),
        notes: nullable(this.form.notes),
      };
    },
    async saveProject() {
      this.formError = '';
      if (!this.form.name.trim() || !this.form.slug.trim() || !this.form.clientArea.trim()) {
        this.formError = 'Preencha nome, slug e cliente/área.';
        return;
      }
      this.saving = true;
      try {
        const edit = Boolean(this.form.id),
          body = this.payload();
        if (edit) body.version = this.form.version;
        const r = await fetch(edit ? `/api/projects/${this.form.id}` : '/api/projects', {
          method: edit ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json', 'x-csrf-token': this.csrfToken },
          body: JSON.stringify(body),
        });
        if (!r.ok) await apiError(r, 'Não foi possível salvar o projeto.');
        this.closeForm();
        this.showToast(edit ? 'Projeto atualizado.' : 'Projeto criado.');
        await this.load();
      } catch (e) {
        this.formError = e.message;
      } finally {
        this.saving = false;
      }
    },
    async archiveProject(e) {
      const p = this.projects.find((x) => x.id === e.currentTarget.dataset.id);
      if (!p || !confirm('Arquivar este projeto?')) return;
      await this.projectAction(p, 'archive', 'Projeto arquivado.');
    },
    async restoreProject(e) {
      const p = this.projects.find((x) => x.id === e.currentTarget.dataset.id);
      if (p && this.isAdmin) await this.projectAction(p, 'restore', 'Projeto restaurado.');
    },
    async projectAction(p, action, msg) {
      try {
        const r = await fetch(`/api/projects/${p.id}/${action}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-csrf-token': this.csrfToken },
          body: JSON.stringify({ version: p.version }),
        });
        if (!r.ok) await apiError(r, 'Não foi possível alterar o projeto.');
        this.showToast(msg);
        await this.load();
      } catch (e) {
        this.error = e.message;
      }
    },
    async deleteProject(e) {
      const p = this.projects.find((x) => x.id === e.currentTarget.dataset.id);
      if (!p || !this.isAdmin || !confirm('Excluir definitivamente este projeto?')) return;
      try {
        const r = await fetch(`/api/projects/${p.id}`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json', 'x-csrf-token': this.csrfToken },
          body: JSON.stringify({ version: p.version }),
        });
        if (!r.ok) await apiError(r, 'Não foi possível excluir.');
        this.showToast('Projeto excluído.');
        await this.load();
      } catch (err) {
        this.error = err.message;
      }
    },
  }));
}
