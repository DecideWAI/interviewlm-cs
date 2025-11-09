/**
 * @jest-environment node
 */

import { compare, hash } from 'bcryptjs'

describe('Authentication Utilities', () => {
  describe('Password hashing', () => {
    it('should hash passwords securely', async () => {
      const password = 'testPassword123'
      const hashedPassword = await hash(password, 12)

      expect(hashedPassword).toBeDefined()
      expect(hashedPassword).not.toBe(password)
      expect(hashedPassword.length).toBeGreaterThan(0)
    })

    it('should generate different hashes for the same password', async () => {
      const password = 'testPassword123'
      const hash1 = await hash(password, 12)
      const hash2 = await hash(password, 12)

      expect(hash1).not.toBe(hash2)
    })

    it('should verify correct password', async () => {
      const password = 'testPassword123'
      const hashedPassword = await hash(password, 12)
      const isMatch = await compare(password, hashedPassword)

      expect(isMatch).toBe(true)
    })

    it('should reject incorrect password', async () => {
      const password = 'testPassword123'
      const wrongPassword = 'wrongPassword456'
      const hashedPassword = await hash(password, 12)
      const isMatch = await compare(wrongPassword, hashedPassword)

      expect(isMatch).toBe(false)
    })

    it('should handle empty passwords', async () => {
      const password = ''
      const hashedPassword = await hash(password, 12)
      const isMatch = await compare('', hashedPassword)

      expect(isMatch).toBe(true)
    })

    it('should be case sensitive', async () => {
      const password = 'TestPassword123'
      const hashedPassword = await hash(password, 12)
      const isMatchLower = await compare('testpassword123', hashedPassword)
      const isMatchUpper = await compare('TESTPASSWORD123', hashedPassword)

      expect(isMatchLower).toBe(false)
      expect(isMatchUpper).toBe(false)
    })
  })
})
