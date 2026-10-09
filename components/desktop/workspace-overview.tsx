'use client'

import Link from 'next/link'
import { ArrowUpRight, Bot, FolderOpen, Laptop, Plus, Users } from 'lucide-react'
import type { AccountHost } from '@/lib/desktop-hosts'
import type { ProjectRoot, ProjectSession, WorkspaceProject } from '@/lib/workspace-projects'
import styles from './desktop-project-shell.module.css'

export function adapterLabel(adapter: string) {
  return ({ codex: 'Codex', 'claude-code': 'Claude Code', gemini: 'Gemini', pi: 'Pi', dsh: 'DSH', deepseek: 'DeepSeek', openclaw: 'OpenClaw' } as Record<string, string>)[adapter] || adapter
}

export function WorkspaceOverview({ projects, roots, hosts, en, create, href, setupPath }: {
  projects: WorkspaceProject[]; roots: ProjectRoot[]; hosts: AccountHost[]; en: boolean
  create: (project?: WorkspaceProject) => void; href: (project: WorkspaceProject, session: ProjectSession) => string; setupPath: string
}) {
  return <section className={styles.overview} aria-label={en ? 'Workspace overview' : '工作区概览'}>
    <header className={styles.overviewHeader}>
      <div><span className={styles.eyebrow}>WTT</span><h1>{en ? 'Workspaces' : '工作区'}</h1></div>
      <button className={styles.primary} onClick={() => create()}><Plus size={16} />{en ? 'New Workspace' : '新建 Workspace'}</button>
    </header>
    <div className={styles.overviewSections}>
      <div>
        <h2 className={styles.sectionTitle}><FolderOpen size={15} />{en ? 'Projects' : '项目'}<span>{projects.length}</span></h2>
        {projects.length ? <div className={styles.projectList}>{projects.map(project => {
          const session = project.sessions[0]
          const root = roots.find(root => root.root_id === project.root_id)
          const host = hosts.find(host => host.host_id === project.host_id)
          const content = <><FolderOpen size={19} /><span className={styles.projectCopy}><strong>{project.name}</strong><span>{root?.name || (en ? 'Project directory' : '项目目录')}{root?.host_name || host?.display_name ? ` · ${root?.host_name || host?.display_name}` : ''}</span></span><span className={styles.sessionCount}>{session?.participants.length > 1 ? <Users size={14} /> : <Bot size={14} />}{project.sessions.length}</span><ArrowUpRight size={15} /></>
          return session ? <Link key={project.workspace_id} className={styles.projectRow} href={href(project, session)}>{content}</Link> : <button key={project.workspace_id} className={styles.projectRow} disabled={project.root_revoked} aria-label={`${en ? 'Add session to' : '为以下项目添加会话'} ${project.name}`} onClick={() => create(project)}>{content}</button>
        })}</div> : <div className={styles.emptyProject}><FolderOpen size={32} strokeWidth={1.25} /><span>{en ? 'No Workspaces yet' : '暂无工作区'}</span></div>}
      </div>
      <div>
        <h2 className={styles.sectionTitle}><Laptop size={15} />{en ? 'Computers & adapters' : '主机与 Agent'}<Link href={setupPath} title={en ? 'Manage computers' : '管理主机'} aria-label={en ? 'Manage computers' : '管理主机'}><ArrowUpRight size={15} /></Link></h2>
        <div className={styles.computerList}>{hosts.filter(host => host.status !== 'revoked' && host.agents.length).map(host => <Link key={host.host_id} className={styles.computerRow} href={setupPath}>
          <Laptop size={17} /><span className={styles.projectCopy}><strong>{host.display_name}</strong><span>{Array.from(new Set(host.agents.map(agent => adapterLabel(agent.adapter)))).join(' · ')}</span></span><span className={styles.connection} data-online={host.status === 'online'}>{host.status === 'online' ? (en ? 'Online' : '在线') : (en ? 'Offline' : '离线')}</span>
        </Link>)}</div>
        {!hosts.some(host => host.status !== 'revoked' && host.agents.length) && <Link className={styles.connectLink} href={setupPath}><Plus size={15} />{en ? 'Enable a computer' : '接入主机'}</Link>}
      </div>
    </div>
  </section>
}
