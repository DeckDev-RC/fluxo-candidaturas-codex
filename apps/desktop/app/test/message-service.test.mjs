import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessageService } from '../src/message-service.mjs';

test('message service generates a recruiter draft through the allowlisted script', async () => {
  const calls = [];
  const service = createMessageService({
    async scriptRunner(name, args) {
      calls.push({ name, args });
      return { ok: true, exitCode: 0, stdout: 'Olá, posso conversar sobre a vaga.', stderr: '' };
    }
  });

  const result = await service.createDraft({ company: 'Acme', role: 'Dev', recruiterName: 'Pessoa Teste', highlights: ['Python', 'APIs'] });

  assert.equal(result.text, 'Olá, posso conversar sobre a vaga.');
  assert.equal(calls[0].name, 'gerar-mensagem-recrutador.ps1');
  assert.equal(calls[0].args.includes('Python,APIs'), true);
});

test('message service rejects incomplete drafts', async () => {
  const service = createMessageService({ async scriptRunner() { throw new Error('must not run'); } });

  await assert.rejects(() => service.createDraft({ company: 'Acme' }), (error) => error.code === 'invalid_message');
});
