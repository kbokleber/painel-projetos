import Alpine from '@alpinejs/csp';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import './styles.css';
import { registerProjectsPage } from './projects.js';
import { registerTasksPage } from './tasks.js';
import { registerProjectDetail } from './project-detail.js';

export async function csrf() {
  const response = await fetch('/auth/csrf', { credentials: 'same-origin' });
  if (!response.ok) throw new Error();
  return (await response.json()).csrfToken;
}
export const apiError = async (response, fallback) => {
  const data = await response.json().catch(() => ({}));
  throw new Error(typeof data.error === 'string' ? data.error : fallback);
};
export const initials = (value) =>
  String(value || '?')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
export const dateLabel = (value) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(
        new Date(`${value}T12:00:00`),
      )
    : 'Sem prazo';
export const statusLabel = (value) =>
  ({
    BACKLOG: 'Backlog',
    PLANEJADO: 'Planejado',
    EM_ANDAMENTO: 'Em andamento',
    PAUSADO: 'Pausado',
    CONCLUIDO: 'Concluído',
    CANCELADO: 'Cancelado',
    PENDENTE: 'Pendente',
    BLOQUEADA: 'Bloqueada',
    CONCLUIDA: 'Concluída',
    CANCELADA: 'Cancelada',
  })[value] || value;

const shared = () => ({
  profileOpen: false,
  globalSearch: '',
  toast: '',
  toastType: 'success',
  toastTimer: null,
  showToast(message, type = 'success') {
    this.toast = message;
    this.toastType = type;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast = '';
    }, 5000);
  },
  toggleProfile() {
    this.profileOpen = !this.profileOpen;
  },
  closeProfile() {
    this.profileOpen = false;
  },
  async signOut() {
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
  runGlobalSearch() {
    if (this.globalSearch.trim())
      window.location.assign(`/projects?search=${encodeURIComponent(this.globalSearch.trim())}`);
  },
  initials(value) {
    return initials(value);
  },
  date(value) {
    return dateLabel(value);
  },
  label(value) {
    return statusLabel(value);
  },
});

Alpine.data('loginPage', () => ({
  username: '',
  password: '',
  error: '',
  submitting: false,
  csrfToken: '',
  async init() {
    try {
      this.csrfToken = await csrf();
    } catch {
      this.error = 'Serviço temporariamente indisponível. Tente novamente.';
    }
  },
  async submit() {
    this.error = '';
    this.submitting = true;
    try {
      if (!this.csrfToken) this.csrfToken = await csrf();
      const response = await fetch('/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': this.csrfToken },
        body: JSON.stringify({ username: this.username, password: this.password }),
      });
      if (!response.ok) {
        this.error = 'Usuário ou senha inválidos.';
        this.csrfToken = await csrf();
        return;
      }
      window.location.assign('/dashboard');
    } catch {
      this.error = 'Não foi possível entrar. Tente novamente.';
    } finally {
      this.submitting = false;
    }
  },
}));

Alpine.data('dashboardPage', () => ({
  ...shared(),
  user: null,
  projects: [],
  stats: { total: 0, inProgress: 0, overdue: 0, completed: 0 },
  loading: true,
  error: '',
  csrfToken: '',
  get greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  },
  get firstName() {
    const username = this.user?.username || '';
    const canonicalNames = { kbokleber: 'Kleber', ana: 'Ana' };
    if (canonicalNames[username]) return canonicalNames[username];
    const first = username.split(/[._-]/)[0];
    return first ? `${first[0].toUpperCase()}${first.slice(1)}` : '';
  },
  async init() {
    await this.load();
  },
  async load() {
    this.loading = true;
    this.error = '';
    try {
      const [me, token, projectResponse] = await Promise.all([
        fetch('/auth/me'),
        csrf(),
        fetch('/api/projects?page=1&pageSize=100&archived=exclude'),
      ]);
      if (me.status === 401) {
        location.assign('/login');
        return;
      }
      if (!me.ok || !projectResponse.ok) throw new Error();
      this.user = (await me.json()).user;
      this.csrfToken = token;
      const data = await projectResponse.json();
      this.projects = data.items || [];
      const total = Number(data.total || this.projects.length);
      for (let page = 2; this.projects.length < total; page += 1) {
        const response = await fetch(`/api/projects?page=${page}&pageSize=100&archived=exclude`);
        if (!response.ok) throw new Error();
        const next = await response.json();
        const items = next.items || [];
        if (!items.length) break;
        this.projects.push(...items);
      }
      const today = new Date().toISOString().slice(0, 10);
      this.stats = {
        total: this.projects.length,
        inProgress: this.projects.filter((p) => p.status === 'EM_ANDAMENTO').length,
        overdue: this.projects.filter(
          (p) => p.dueDate && p.dueDate < today && p.status !== 'CONCLUIDO',
        ).length,
        completed: this.projects.filter((p) => p.status === 'CONCLUIDO').length,
      };
    } catch {
      this.error = 'Não foi possível carregar o painel.';
    } finally {
      this.loading = false;
    }
  },
}));

registerProjectsPage(Alpine, shared);
registerTasksPage(Alpine, shared);
registerProjectDetail(Alpine, shared);
Alpine.start();
