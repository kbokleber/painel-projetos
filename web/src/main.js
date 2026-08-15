import Alpine from '@alpinejs/csp';
import './styles.css';
import { registerProjectsPage } from './projects.js';
import { registerTasksPage } from './tasks.js';

async function requestCsrfToken() {
  const response = await fetch('/auth/csrf', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Não foi possível iniciar uma sessão segura.');
  const data = await response.json();
  return data.csrfToken;
}

Alpine.data('loginPage', () => ({
  username: '',
  password: '',
  error: '',
  submitting: false,
  csrfToken: '',

  async init() {
    try {
      this.csrfToken = await requestCsrfToken();
    } catch {
      this.error = 'Serviço temporariamente indisponível. Tente novamente.';
    }
  },

  async submit() {
    this.error = '';
    this.submitting = true;
    try {
      if (!this.csrfToken) this.csrfToken = await requestCsrfToken();
      const response = await fetch('/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': this.csrfToken,
        },
        body: JSON.stringify({ username: this.username, password: this.password }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        this.error = data.error || 'Usuário ou senha inválidos.';
        this.csrfToken = await requestCsrfToken();
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
  user: null,
  error: '',
  csrfToken: '',

  get usernameLabel() {
    return this.user ? this.user.username : '';
  },

  get roleLabel() {
    return this.user ? this.user.role : '';
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
      if (!meResponse.ok) throw new Error('Falha ao carregar usuário.');
      const data = await meResponse.json();
      this.user = data.user;
      this.csrfToken = csrfToken;
    } catch {
      this.error = 'Não foi possível carregar o painel.';
    }
  },

  async logout() {
    try {
      const response = await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': this.csrfToken },
      });
      if (!response.ok && response.status !== 401) throw new Error('Falha no logout.');
    } finally {
      window.location.assign('/login');
    }
  },
}));

registerProjectsPage(Alpine, requestCsrfToken);
registerTasksPage(Alpine);

Alpine.start();
