// 客户端版本条件判断：规则形如 ">= 8.2"，支持 >、>=、<、<=、=、==，缺省操作符按 >= 处理

// 解析语义化版本号，预发布/构建后缀（-rc、+build 等）忽略；无法识别返回 null
export function parseVersion(raw: string): number[] | null {
  const core = raw.trim().split(/[-+]/)[0];
  if (!/^\d+(\.\d+)*$/.test(core)) return null;
  return core.split('.').map((part) => Number.parseInt(part, 10));
}

export function compareVersion(a: string, b: string): number | null {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return null;
  const length = Math.max(va.length, vb.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (va[i] ?? 0) - (vb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

// 校验客户端版本是否满足规则；规则为空表示不限版本；规则或客户端版本无法解析时按不满足处理（fail-closed）
export function versionSatisfies(rule: string, appVersion: string): boolean {
  const constraint = rule.trim();
  if (!constraint) return true;
  const matched = /^(>=|<=|==|=|>|<)?\s*(.+)$/.exec(constraint);
  if (!matched) return false;
  const operator = matched[1] ?? '>=';
  const target = matched[2].trim();
  const cmp = compareVersion(appVersion, target);
  if (cmp === null) return false;
  if (operator === '>') return cmp > 0;
  if (operator === '<') return cmp < 0;
  if (operator === '<=') return cmp <= 0;
  if (operator === '=' || operator === '==') return cmp === 0;
  return cmp >= 0;
}
