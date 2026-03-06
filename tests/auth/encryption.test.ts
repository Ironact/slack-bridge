import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../../src/auth/encryption.js';

describe('encryption', () => {
  const passphrase = 'test-passphrase-at-least-32-chars-long!!';

  it('should encrypt and decrypt a string', () => {
    const plaintext = 'Hello, world!';
    const encrypted = encrypt(plaintext, passphrase);
    const decrypted = decrypt(encrypted, passphrase);
    expect(decrypted).toBe(plaintext);
  });

  it('should encrypt and decrypt JSON data', () => {
    const data = { token: 'xoxc-test', cookie: 'xoxd-test', nested: { a: 1 } };
    const plaintext = JSON.stringify(data);
    const encrypted = encrypt(plaintext, passphrase);
    const decrypted = decrypt(encrypted, passphrase);
    expect(JSON.parse(decrypted)).toEqual(data);
  });

  it('should produce different ciphertexts for the same plaintext (unique IV/salt)', () => {
    const plaintext = 'same-input';
    const enc1 = encrypt(plaintext, passphrase);
    const enc2 = encrypt(plaintext, passphrase);
    expect(enc1.data).not.toBe(enc2.data);
    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.salt).not.toBe(enc2.salt);
  });

  it('should fail to decrypt with wrong passphrase', () => {
    const plaintext = 'secret data';
    const encrypted = encrypt(plaintext, passphrase);
    expect(() => decrypt(encrypted, 'wrong-passphrase-that-is-also-long')).toThrow();
  });

  it('should fail to decrypt with tampered data', () => {
    const plaintext = 'secret data';
    const encrypted = encrypt(plaintext, passphrase);
    // Flip a byte to ensure the data is actually different
    const firstChar = encrypted.data[0]!;
    const flipped = firstChar === 'a' ? 'b' : 'a';
    encrypted.data = flipped + encrypted.data.slice(1);
    expect(() => decrypt(encrypted, passphrase)).toThrow();
  });

  it('should fail to decrypt with tampered tag', () => {
    const plaintext = 'secret data';
    const encrypted = encrypt(plaintext, passphrase);
    encrypted.tag = '00'.repeat(16);
    expect(() => decrypt(encrypted, passphrase)).toThrow();
  });

  it('should produce valid hex strings', () => {
    const encrypted = encrypt('test', passphrase);
    const hexRegex = /^[0-9a-f]+$/;
    expect(encrypted.iv).toMatch(hexRegex);
    expect(encrypted.salt).toMatch(hexRegex);
    expect(encrypted.data).toMatch(hexRegex);
    expect(encrypted.tag).toMatch(hexRegex);
  });

  it('should handle empty string', () => {
    const encrypted = encrypt('', passphrase);
    const decrypted = decrypt(encrypted, passphrase);
    expect(decrypted).toBe('');
  });

  it('should handle unicode', () => {
    const plaintext = '한국어 테스트 🚀';
    const encrypted = encrypt(plaintext, passphrase);
    const decrypted = decrypt(encrypted, passphrase);
    expect(decrypted).toBe(plaintext);
  });
});
