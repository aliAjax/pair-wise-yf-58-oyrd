# pair-wise-yf-58 功能开关和灰度发布控制台

## 源提示词摘要
产品负责人配置目标用户、地区、应用版本和依赖条件，研发负责人审批发布计划，值班人员观察过程并随时关闭开关。系统支持规则组合、流量逐步增加、定时生效、紧急停止、回滚，并能在保存前模拟不同用户的命中版本。

## 技术栈
Vue 3 + TypeScript + Vite + Ant Design Vue + Pinia + Vue Router + Axios + VueUse + VeeValidate + Zod + Vue I18n。

## 已实现闭环
- 功能开关、发布计划、审计记录三类业务对象。
- 规则组合、模拟用户命中、逐步调整流量和定时生效。
- 产品/研发双审批、开始灰度、紧急停止、回滚和恢复草稿。
- 离线提示、VeeValidate + Zod 精确校验和 localStorage 持久化。

## 启动
```bash
npm install
npm run dev
```
开发端口：62023
