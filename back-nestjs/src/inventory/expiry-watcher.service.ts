import {
	Injectable,
	Logger,
	OnApplicationBootstrap,
	OnModuleDestroy
} from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { SettingsService } from '../settings/settings.service'
import { HOUR_MS } from './expiry'
import { purgeStopHistory, runExpiryJobs } from './expiry-jobs'

// Страховочная проверка: если точный таймер пропустил событие (сон ноутбука,
// поставка с близким сроком), склад догонит не позже чем через 30 секунд
const SAFETY_INTERVAL_MS = 30_000
const PURGE_INTERVAL_MS = HOUR_MS
// Больше этого setTimeout не держит; дальние события поймает страховка
const MAX_TIMER_MS = 2_147_483_647

/**
 * Следит за сроками без участия людей: в момент, когда партия перестаёт
 * годиться для готовки, пересчитывает авто-стоп; в момент истечения — списывает
 * партию и пишет менеджеру. Раз в час удаляет историю стоп-листа старше недели
 */
@Injectable()
export class ExpiryWatcher implements OnApplicationBootstrap, OnModuleDestroy {
	private readonly logger = new Logger(ExpiryWatcher.name)
	private timer?: NodeJS.Timeout
	private interval?: NodeJS.Timeout
	private lastCheck: Date | null = null
	private lastPurge = 0
	private running: Promise<void> | null = null
	private rerun = false
	private rerunForce = false

	constructor(
		private readonly prisma: PrismaService,
		private readonly settings: SettingsService
	) {}

	onApplicationBootstrap() {
		this.settings.onChange(() => this.check(true))
		this.interval = setInterval(() => void this.check(), SAFETY_INTERVAL_MS)
		void this.check(true)
	}

	onModuleDestroy() {
		clearInterval(this.interval)
		clearTimeout(this.timer)
	}

	/** force — пересчитать всё, даже если никакой срок не пересечён */
	check(force = false): Promise<void> {
		if (this.running) {
			this.rerun = true
			this.rerunForce ||= force
			return this.running
		}
		this.running = this.run(force).finally(() => {
			this.running = null
			if (!this.rerun) return
			const again = this.rerunForce
			this.rerun = false
			this.rerunForce = false
			void this.check(again)
		})
		return this.running
	}

	private async run(force: boolean) {
		const now = new Date()
		try {
			const { writtenOff, next } = await runExpiryJobs(this.prisma, {
				now,
				since: force ? null : this.lastCheck
			})
			// При ошибке lastCheck не двигается — следующая проверка догонит пропущенное
			this.lastCheck = now
			if (writtenOff)
				this.logger.log(`Система списала просроченных партий: ${writtenOff}`)
			this.plan(next)

			if (now.getTime() - this.lastPurge >= PURGE_INTERVAL_MS) {
				const purged = await purgeStopHistory(this.prisma, now)
				this.lastPurge = now.getTime()
				if (purged)
					this.logger.log(`Удалено записей стоп-листа старше недели: ${purged}`)
			}
		} catch (error) {
			this.logger.error('Проверка сроков не удалась', error)
		}
	}

	private plan(next: Date | null) {
		clearTimeout(this.timer)
		if (!next) return
		// Чуть позже события, чтобы граница «срок ≤ сейчас» уже выполнялась
		const delay = Math.max(next.getTime() - Date.now(), 0) + 20
		if (delay > MAX_TIMER_MS) return
		this.timer = setTimeout(() => void this.check(), delay)
	}
}
