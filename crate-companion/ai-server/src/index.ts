import Anthropic from '@anthropic-ai/sdk';
import { DurableObject } from 'cloudflare:workers';
import { runTask } from '../../core/ai/llm';
import { handle, MODEL } from './handler';
import { Meter, type Limits } from './meter';

/** Crate Companion's AI server on Cloudflare Workers. Settings are in wrangler.toml. */

interface Env {
  ANTHROPIC_API_KEY: string;
  AI_ENABLED?: string;
  MONTHLY_USES?: string;
  IP_DAILY_REQUESTS?: string;
  MONTHLY_BUDGET_USD?: string;
  METER: DurableObjectNamespace<MeterObject>;
}

const limits = (env: Env): Limits => ({
  monthlyUses: Number(env.MONTHLY_USES ?? 150),
  ipDailyRequests: Number(env.IP_DAILY_REQUESTS ?? 300),
  monthlyBudgetUsd: Number(env.MONTHLY_BUDGET_USD ?? 10),
});

/** Holds every count, in one place, so they're exact. */
export class MeterObject extends DurableObject<Env> {
  private meter = new Meter(this.ctx.storage, limits(this.env));
  reserve(install: string, use: string, ip: string) { return this.meter.reserve(install, use, ip); }
  refund(install: string, use: string) { return this.meter.refund(install, use); }
  spend(usd: number) { return this.meter.spend(usd); }
  allowance(install: string) { return this.meter.allowance(install); }
  spent() { return this.meter.spent(); }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const meter = env.METER.get(env.METER.idFromName('all'));
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 3 * 60_000 });
    return handle(req, {
      enabled: env.AI_ENABLED === 'true' && !!env.ANTHROPIC_API_KEY,
      meter: {
        reserve: (i, u, ip) => meter.reserve(i, u, ip),
        refund: (i, u) => meter.refund(i, u),
        spend: (usd) => meter.spend(usd),
        allowance: (i) => meter.allowance(i),
      },
      run: (task, content) => runTask(client, MODEL, { task, content }, 8000),
    });
  },
} satisfies ExportedHandler<Env>;
