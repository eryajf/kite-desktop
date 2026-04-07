import { useTranslation } from 'react-i18next'

import { PROJECT_REPOSITORY_URL } from '@/lib/project'

export function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="border-t">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center space-y-2 md:space-y-0">
          <p className="text-sm text-gray-500">
            {t('login.footer', { year: new Date().getFullYear() })}
          </p>
          <div className="flex space-x-6 text-sm text-gray-500">
            <a href="https://kite.zzde.me" target="_blank" className="app-link">
              {t('login.documentation')}
            </a>
            <a
              href={PROJECT_REPOSITORY_URL}
              target="_blank"
              className="app-link"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
