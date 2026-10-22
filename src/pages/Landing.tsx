import { Link, Navigate } from 'react-router-dom'
import { Icon } from '../components/icons'
import { useAuth } from '../lib/auth'
import { useLocale } from '../i18n'

export default function Landing() {
  const { user, loading } = useAuth()
  const { t } = useLocale()

  if (user && !loading) {
    return <Navigate to="/dashboard" replace />
  }

  const features = [
    { icon: '📝', title: t('landing.featureLogTitle'), body: t('landing.featureLogBody') },
    { icon: '📸', title: t('landing.featureScanTitle'), body: t('landing.featureScanBody') },
    { icon: '🔥', title: t('landing.featureStreakTitle'), body: t('landing.featureStreakBody') },
    { icon: '🏆', title: t('landing.featureRankTitle'), body: t('landing.featureRankBody') },
  ]

  const promises = [t('landing.promiseFree'), t('landing.promiseStore'), t('landing.promiseGoogle')]

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="border-b border-line">
        <div className="mx-auto flex min-h-[56px] max-w-5xl items-center justify-between gap-3 px-4">
          <span className="flex items-center gap-2 font-semibold text-content">
            <span className="text-accent" aria-hidden="true">▲</span> fitness
          </span>
          <Link to="/login" className="btn-secondary">
            {t('common.signIn')}
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 pb-12 pt-10 text-center sm:pb-16 sm:pt-16">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1 text-[11px] font-medium text-muted">
            <span className="text-accent" aria-hidden="true">⚡</span> {t('landing.badge')}
          </p>
          <h1 className="mx-auto max-w-3xl text-3xl font-bold leading-tight tracking-tight text-content sm:text-5xl">
            {t('landing.title').replace(t('landing.titleAccent'), '').trim()}
            <span className="block text-accent">{t('landing.titleAccent')}</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted sm:text-base">
            {t('landing.subtitle')}
          </p>
          <div className="mx-auto mt-7 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
            <Link to="/login" className="btn-primary btn-lg">
              {t('landing.start')}
              <Icon name="chevron-right" size={18} />
            </Link>
            <Link to="/install" className="btn-secondary btn-lg">
              {t('landing.install')}
            </Link>
          </div>
        </section>

        <section className="border-t border-line bg-surface/30">
          <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
            <h2 className="text-center text-[15px] font-semibold text-content sm:text-lg">
              {t('landing.featuresTitle')}
            </h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              {features.map((feature) => (
                <div key={feature.title} className="card p-5">
                  <div className="mb-3 text-2xl" aria-hidden="true">
                    {feature.icon}
                  </div>
                  <h3 className="font-semibold text-content">{feature.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-8">
            {promises.map((promise) => (
              <span
                key={promise}
                className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-[12px] text-muted"
              >
                {promise}
              </span>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
