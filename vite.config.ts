import { copyFileSync } from 'node:fs'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { orgNameFromEnv, pollAppTitle } from './src/lib/org'

function githubPagesFallback(): Plugin {
  return {
    name: 'github-pages-spa-fallback',
    closeBundle() {
      copyFileSync('dist/index.html', 'dist/404.html')
    },
  }
}

function orgTitle(orgName: string): Plugin {
  const title = pollAppTitle(orgName)
  return {
    name: 'org-title',
    transformIndexHtml(html) {
      return html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const orgName = orgNameFromEnv(env.VITE_ORG_NAME)
  return {
    plugins: [react(), tailwindcss(), orgTitle(orgName), githubPagesFallback()],
    base: '/poll/',
  }
})
