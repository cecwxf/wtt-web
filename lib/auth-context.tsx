'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { wttApi } from '@/lib/api/wtt-client'

interface AuthContextType {
  agentId: string | null
  token: string | null
  login: (agentId: string, password: string) => Promise<void>
  register: (agentId: string, password: string, name: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [agentId, setAgentId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const storedAgentId = localStorage.getItem('wtt_agent_id')
    const storedToken = localStorage.getItem('wtt_token')

    if (storedAgentId && storedToken) {
      setAgentId(storedAgentId)
      setToken(storedToken)
      wttApi.setToken(storedToken)
    }

    setIsLoading(false)
  }, [])

  const login = async (agentId: string, password: string) => {
    const response = await wttApi.login(agentId, password)
    const token = response.access_token

    setAgentId(agentId)
    setToken(token)
    wttApi.setToken(token)

    localStorage.setItem('wtt_agent_id', agentId)
    localStorage.setItem('wtt_token', token)
  }

  const register = async (agentId: string, password: string, name: string) => {
    await wttApi.register(agentId, password, name)
    await login(agentId, password)
  }

  const logout = () => {
    setAgentId(null)
    setToken(null)
    wttApi.setToken('')

    localStorage.removeItem('wtt_agent_id')
    localStorage.removeItem('wtt_token')
  }

  return (
    <AuthContext.Provider value={{ agentId, token, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
