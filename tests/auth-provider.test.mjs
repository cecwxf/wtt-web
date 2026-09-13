import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const GithubProvider = require('next-auth/providers/github').default

test('GitHub OAuth provider declares the RFC 9207 issuer', () => {
  const provider = GithubProvider({
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
  })

  assert.equal(provider.issuer, 'https://github.com/login/oauth')
})
