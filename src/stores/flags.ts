import { defineStore } from 'pinia';

export type FlagStatus = 'draft' | 'approved' | 'rolling' | 'scheduled' | 'stopped' | 'rolled-back';
export interface RuleSet { region: string; appVersion: string; authenticated: boolean; }
export interface FeatureFlag { id: string; name: string; key: string; enabled: boolean; rollout: number; rules: RuleSet; status: FlagStatus; }
export interface RolloutPlan { id: string; flagId: string; scheduledAt: string; approvals: string[]; version: number; }
export interface AuditRecord { id: string; at: string; actor: string; action: string; detail: string; }

interface State { flags: FeatureFlag[]; plans: RolloutPlan[]; audit: AuditRecord[]; activeId: string; }

const seed: State = {
  activeId: 'f1',
  flags: [
    { id: 'f1', name: '新版结算页', key: 'checkout-v2', enabled: false, rollout: 10, rules: { region: '上海', appVersion: '>= 8.2', authenticated: true }, status: 'draft' },
    { id: 'f2', name: '推荐模型 B', key: 'recommend-model-b', enabled: true, rollout: 35, rules: { region: '全部', appVersion: '>= 8.0', authenticated: false }, status: 'rolling' }
  ],
  plans: [{ id: 'p1', flagId: 'f1', scheduledAt: '2026-10-01T10:00', approvals: [], version: 3 }],
  audit: [
    { id: 'a1', at: '09:10', actor: '产品负责人', action: '创建草稿', detail: 'checkout-v2 规则草案 v3' },
    { id: 'a2', at: '09:22', actor: '研发负责人', action: '规则校验', detail: '依赖 payment-v3 已启用' }
  ]
};

function load(): State { const saved = localStorage.getItem('yf58-flag-state'); return saved ? JSON.parse(saved) as State : structuredClone(seed); }

function parseVersion(value: string): number[] {
  return value.trim().split('.').map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersion(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** 校验用户客户端版本是否满足规则中的版本条件，支持 >= <= > < = 以及裸版本号（默认 >=）。 */
function versionSatisfied(userVersion: string, constraint: string): boolean {
  const match = /^\s*(>=|<=|==|=|>|<)?\s*v?(\d+(?:\.\d+)*)/.exec(constraint);
  if (!match) return true; // 规则里没有有效版本号时，不作为拦截条件
  const operator = match[1] && match[1] !== '=' ? match[1] : match[1] === '=' ? '==' : '>=';
  const cmp = compareVersion(userVersion, match[2]);
  switch (operator) {
    case '>=': return cmp >= 0;
    case '<=': return cmp <= 0;
    case '>': return cmp > 0;
    case '<': return cmp < 0;
    default: return cmp === 0;
  }
}

export const useFlagStore = defineStore('flags', {
  state: () => load(),
  getters: { active(state): FeatureFlag | undefined { return state.flags.find((item) => item.id === state.activeId); }, activePlan(state): RolloutPlan | undefined { return state.plans.find((item) => item.flagId === state.activeId); } },
  actions: {
    persist() { localStorage.setItem('yf58-flag-state', JSON.stringify(this.$state)); },
    recordAudit(action: string, detail: string, actor = '当前操作人') { this.audit.unshift({ id: `a-${Date.now()}`, at: new Date().toLocaleTimeString(), actor, action, detail }); this.persist(); },
    select(id: string) { this.activeId = id; this.persist(); },
    /**
     * 方案内容（规则/放量比例/定时时间）发生变更后，已有的产品、研发审批一律作废，
     * 方案版本号递增并退回草稿，避免拿旧审批替新方案放量。
     * 返回 true 表示确实有审批被作废。
     */
    invalidateApprovals(reason: string): boolean {
      const plan = this.activePlan;
      if (!plan || plan.approvals.length === 0) return false;
      const invalidated = plan.approvals.join('、');
      plan.approvals = [];
      plan.version += 1;
      if (this.active) this.active.status = 'draft';
      this.recordAudit('审批作废', `${reason}，方案更新为 v${plan.version}；${invalidated} 的审批已全部作废，退回草稿重新走双审批`);
      return true;
    },
    updateRule(rule: Partial<RuleSet>) {
      if (!this.active) return;
      const changed = Object.entries(rule).some(([key, value]) => this.active?.rules[key as keyof RuleSet] !== value);
      if (!changed) return;
      this.active.rules = { ...this.active.rules, ...rule };
      this.active.status = 'draft';
      if (this.invalidateApprovals(`规则被修改为 ${JSON.stringify(this.active.rules)}`)) return;
      this.recordAudit('修改规则', JSON.stringify(this.active.rules));
    },
    setRollout(value: number) {
      if (!this.active || value === this.active.rollout) return;
      const previous = this.active.rollout;
      this.active.rollout = value;
      if (this.invalidateApprovals(`放量比例由 ${previous}% 调整为 ${value}%`)) return;
      this.recordAudit('调整放量', `${this.active.key} ${previous}% → ${value}%`);
    },
    schedule(value: string) {
      if (!this.active || !this.activePlan || value === this.activePlan.scheduledAt) return;
      const previous = this.activePlan.scheduledAt;
      this.activePlan.scheduledAt = value;
      if (this.invalidateApprovals(`定时生效时间由 ${previous} 调整为 ${value}`)) return;
      this.active.status = 'scheduled';
      this.recordAudit('设置定时', `${this.active.key} 于 ${value} 生效`);
    },
    approve(role: string) { if (!this.active || !this.activePlan || this.activePlan.approvals.includes(role)) return; this.activePlan.approvals.push(role); this.active.status = this.activePlan.approvals.length >= 2 ? 'approved' : 'draft'; this.recordAudit('审批发布', `${role} 已确认 ${this.active.key} v${this.activePlan.version}`, role); this.persist(); },
    startRollout() { if (!this.active || this.active.status !== 'approved') return; this.active.enabled = true; this.active.status = 'rolling'; this.recordAudit('开始放量', `${this.active.key} 启用 ${this.active.rollout}%（方案 v${this.activePlan?.version}）`); },
    emergencyStop() { if (!this.active) return; this.active.enabled = false; this.active.status = 'stopped'; this.recordAudit('紧急停止', `${this.active.key} 已立即关闭`); },
    rollback() { if (!this.active) return; this.active.enabled = false; this.active.rollout = 0; this.active.status = 'rolled-back'; this.recordAudit('执行回滚', `${this.active.key} 回滚至关闭状态`); },
    simulateHit(user: { region: string; appVersion: string; authenticated: boolean; id: string }) {
      if (!this.active || !this.active.enabled) return { hit: false, reason: '开关未启用' };
      const rule = this.active.rules;
      if (rule.region !== '全部' && rule.region !== user.region) return { hit: false, reason: `卡在地区条件：规则要求 ${rule.region}，当前用户为 ${user.region}` };
      if (!versionSatisfied(user.appVersion, rule.appVersion)) return { hit: false, reason: `卡在客户端版本条件：规则要求 ${rule.appVersion}，当前客户端为 ${user.appVersion}` };
      if (rule.authenticated && !user.authenticated) return { hit: false, reason: '卡在登录条件：规则要求已登录用户' };
      const hash = [...user.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 100;
      const hit = hash < this.active.rollout;
      return { hit, reason: hit ? `规则全部通过，灰度桶 ${hash} < ${this.active.rollout}%` : `规则全部通过，但灰度桶 ${hash} ≥ ${this.active.rollout}%` };
    }
  }
});
