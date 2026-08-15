# KBO Brand Guidelines

> Identidade visual oficial extraída do site [kbosolucoes.com.br](https://kbosolucoes.com.br) em 14/08/2026.
> Estas regras devem ser seguidas em TODA comunicação visual da KBO Soluções.

---

## 🎨 Paleta de Cores

### Cores Primárias (Azul Corporativo)

| Token | Hex | RGB | Uso |
|---|---|---|---|
| `--kbo-primary` | `#2563eb` | `37, 99, 235` | Botões principais, links, CTAs primários |
| `--kbo-primary-light` | `#3b82f6` | `59, 130, 246` | Hover, gradientes, foco suave |
| `--kbo-primary-extra` | `#60a5fa` | `96, 165, 250` | Estados de foco (outline), acentos secundários |

### Cores de Destaque (Laranja KBO)

| Token | Hex | RGB | Uso |
|---|---|---|---|
| `--kbo-accent` | `#f59e0b` | `245, 158, 11` | CTAs secundários, badges de destaque |
| `--kbo-accent-strong` | `#f97316` | `249, 115, 22` | Hover do accent |

### Cores Neutras (Cinzas)

| Token | Hex | RGB | Uso |
|---|---|---|---|
| `--kbo-text-primary` | `#334155` | `51, 65, 85` | Títulos, texto principal |
| `--kbo-text-secondary` | `#4a5568` | `74, 85, 104` | Subtexto, labels |
| `--kbo-text-light` | `#dbe5f0` | `219, 229, 240` | Texto desabilitado, placeholders |
| `--kbo-bg-light` | `#f8fafc` | `248, 250, 252` | Fundos suaves de página |
| `--kbo-bg-extra-light` | `#f8fbff` | `248, 251, 255` | Fundos de cards |
| `--kbo-white` | `#ffffff` | `255, 255, 255` | Cards, superfícies elevadas |

### Cor Especial

| Token | Hex | RGB | Uso |
|---|---|---|---|
| `--kbo-accent-bg` | `#fff7ed` | `255, 247, 237` | Fundo de badges com accent |

---

## ✍️ Tipografia

**Família única**: `Plus Jakarta Sans` (Google Fonts)

Pesos usados:
- **400** (Regular) — body text
- **600** (SemiBold) — subtítulos, botões, labels destacadas
- **700** (Bold) — títulos principais

### Escala Tipográfica

| Token | px | Uso |
|---|---|---|
| `--text-xs` | 12 | Captions, labels pequenas |
| `--text-sm` | 14 | Botões, inputs |
| `--text-base` | 16 | Body text, cards |
| `--text-lg` | 18 | Subtítulos de seção |
| `--text-xl` | 24 | Títulos de card importantes |
| `--text-2xl` | 32 | Títulos de página |
| `--text-3xl` | 48 | Hero, destaque máximo |

**Line-height**: `1.5` para body, `1.2` para títulos
**Letter-spacing**: `-0.01em` em headings (para melhor leitura de letras grandes)

---

## 🌑 Sombras

| Nível | CSS | Uso |
|---|---|---|
| `--shadow-0` | `none` | Plano, sem elevação |
| `--shadow-1` | `0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)` | Cards em repouso |
| `--shadow-2` | `0 4px 6px rgba(15,23,42,0.05), 0 10px 15px rgba(15,23,42,0.08)` | Hover, elevação média |
| `--shadow-3` | `0 20px 25px rgba(15,23,42,0.10), 0 10px 10px rgba(15,23,42,0.04)` | Modais, dropdowns |

---

## ⭕ Border Radius

| Token | px | Uso |
|---|---|---|
| `--radius-sm` | 8 | Inputs, botões |
| `--radius-md` | 12 | Cards |
| `--radius-lg` | 16 | Modais, containers grandes |
| `--radius-full` | 9999 | Pills, badges, avatares circulares |

---

## 📏 Espaçamento

**Base 4**: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 (pixels)

| Token | px |
|---|---|
| `--space-1` | 4 |
| `--space-2` | 8 |
| `--space-3` | 12 |
| `--space-4` | 16 |
| `--space-5` | 20 |
| `--space-6` | 24 |
| `--space-8` | 32 |
| `--space-10` | 40 |
| `--space-12` | 48 |
| `--space-16` | 64 |

**Padding padrão de card**: `24px`
**Gap entre cards**: `16px`

---

## 🎯 Logo

### Arquivos disponíveis
- `web/public/branding/kbo-logo.png` (50.8 KB) — Logo principal
- `web/public/branding/favicon.svg` (1.3 KB) — Favicon

### Regras de uso do logo
- **Tamanho mínimo**: 32px de altura
- **Área de respiro**: metade da altura da letra "K"
- **Não fazer**:
  - ❌ Distorcer proporções
  - ❌ Mudar cores fora da paleta oficial
  - ❌ Aplicar sombra ou contorno
  - ❌ Sobrepor em fotos sem overlay

---

## 🗣️ Tom de Voz

### Somos
- **Técnicos** mas acessíveis
- **Diretos** mas humanos
- **Confiantes** sem ser arrogantes

### Comunicamos
- ✅ "Soluções que funcionam" — não "soluções mágicas"
- ✅ "Especialistas em ITSM" — não "gurus da tecnologia"
- ✅ "20+ anos de experiência" — não "somos os melhores"

### Evitamos
- ❌ Jargão vazio ("sinergia", "transformação digital")
- ❌ Promessas exageradas
- ❌ Caps lock ou exclamações múltiplas

---

## 📱 Aplicação Digital

Quando aplicar essa marca em produtos (apps, painéis, sites):
- **Mobile-first**: o design deve funcionar perfeito a partir de 360px
- **Touch targets**: mínimo 44x44px em mobile
- **Acessibilidade**: WCAG AA — contraste mínimo 4.5:1 entre texto e fundo
- **Performance**: font-display: swap para evitar FOIT (Flash of Invisible Text)
- **Ícones**: usar lucide-icons ou inline SVG (evitar bibliotecas pagas)
