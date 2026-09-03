// As mesmas regras valem para os dois adapters, então o contrato roda duas
// vezes: uma em disco (num diretório temporário) e uma em memória.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cacheEmDisco, cacheEmMemoria } from './cache.js';

/** Produz valores diferentes a cada chamada, para dar para ver o que veio do cache. */
function contador(prefixo = 'v') {
  let n = 0;
  const produzir = async () => {
    n += 1;
    return `${prefixo}${n}`;
  };
  return { produzir, chamadas: () => n };
}

const adapters = [
  {
    nome: 'disco',
    async criar() {
      const dir = await mkdtemp(path.join(tmpdir(), 'cache-osp-'));
      return { cache: cacheEmDisco({ dir }), limpar: () => rm(dir, { recursive: true, force: true }) };
    },
  },
  {
    nome: 'memória',
    async criar() {
      return { cache: cacheEmMemoria(), limpar: async () => {} };
    },
  },
];

for (const adapter of adapters) {
  describe(`cache em ${adapter.nome}`, () => {
    let cache;
    let limpar;
    beforeEach(async () => { ({ cache, limpar } = await adapter.criar()); });
    afterEach(() => limpar());

    it('devolve o que está guardado enquanto o ttl vale', async () => {
      const { produzir, chamadas } = contador();
      const primeira = await cache.obter('tabela', produzir, { ttl: 60 });
      assert.deepEqual(primeira, { dados: 'v1', doCache: false });

      const segunda = await cache.obter('tabela', produzir, { ttl: 60 });
      assert.deepEqual(segunda, { dados: 'v1', doCache: true });
      assert.equal(chamadas(), 1);
    });

    it('atualizar baixa dado fresco e regrava o que estiver guardado', async () => {
      const { produzir, chamadas } = contador();
      await cache.obter('tabela', produzir, { ttl: 60 });

      const fresca = await cache.obter('tabela', produzir, { ttl: 60, atualizar: true });
      assert.deepEqual(fresca, { dados: 'v2', doCache: false });

      // Regravou: a chamada seguinte já pega o valor novo do cache.
      const depois = await cache.obter('tabela', produzir, { ttl: 60 });
      assert.deepEqual(depois, { dados: 'v2', doCache: true });
      assert.equal(chamadas(), 2);
    });

    it('ttl 0 busca dado fresco sem regravar', async () => {
      const { produzir } = contador();
      await cache.obter('tabela', produzir, { ttl: 60 });

      const avulsa = await cache.obter('tabela', produzir, { ttl: 0 });
      assert.deepEqual(avulsa, { dados: 'v2', doCache: false });

      // Não regravou: o que estava guardado continua valendo.
      const depois = await cache.obter('tabela', produzir, { ttl: 60 });
      assert.deepEqual(depois, { dados: 'v1', doCache: true });
    });

    it('uma produção que falha é descartada, e a chamada seguinte tenta de novo', async () => {
      let tentativas = 0;
      const produzir = async () => {
        tentativas += 1;
        if (tentativas === 1) throw new Error('bubble caiu');
        return 'v2';
      };

      await assert.rejects(cache.obter('tabela', produzir, { ttl: 60 }), /bubble caiu/);
      assert.deepEqual(await cache.obter('tabela', produzir, { ttl: 60 }), { dados: 'v2', doCache: false });
      assert.equal(tentativas, 2);
    });

    it('chaves diferentes não compartilham entrada (live e test)', async () => {
      const { produzir } = contador();
      assert.equal((await cache.obter('FR_OSP', produzir, { ttl: 60 })).dados, 'v1');
      assert.equal((await cache.obter('test_FR_OSP', produzir, { ttl: 60 })).dados, 'v2');
      assert.equal((await cache.obter('FR_OSP', produzir, { ttl: 60 })).dados, 'v1');
    });
  });
}

describe('cache em memória — concorrência', () => {
  it('duas chamadas simultâneas com a mesma chave produzem uma extração só', async () => {
    const cache = cacheEmMemoria();
    let chamadas = 0;
    let liberar;
    const produzir = () => {
      chamadas += 1;
      return new Promise((resolve) => { liberar = () => resolve('linhas'); });
    };

    const a = cache.obter('live', produzir, { ttl: 60 });
    const b = cache.obter('live', produzir, { ttl: 60 });
    liberar();

    assert.deepEqual((await a).dados, 'linhas');
    assert.deepEqual((await b).dados, 'linhas');
    assert.equal(chamadas, 1);
  });

  it('a segunda chamada se junta à primeira mesmo antes de haver ttl válido', async () => {
    const cache = cacheEmMemoria();
    let chamadas = 0;
    let liberar;
    const produzir = () => {
      chamadas += 1;
      return new Promise((resolve) => { liberar = () => resolve('linhas'); });
    };

    const a = cache.obter('live', produzir, { ttl: 1 });
    const b = cache.obter('live', produzir, { ttl: 1 });
    // Só resolve depois das duas entrarem: é a espera que precisa ser compartilhada.
    liberar();
    await Promise.all([a, b]);
    assert.equal(chamadas, 1);
  });

  it('uma falha compartilhada não deixa resultado ruim guardado', async () => {
    const cache = cacheEmMemoria();
    let tentativas = 0;
    const produzir = async () => {
      tentativas += 1;
      if (tentativas === 1) throw new Error('bubble caiu');
      return 'linhas';
    };

    const a = cache.obter('live', produzir, { ttl: 60 });
    const b = cache.obter('live', produzir, { ttl: 60 });
    await assert.rejects(a, /bubble caiu/);
    await assert.rejects(b, /bubble caiu/);

    assert.deepEqual(await cache.obter('live', produzir, { ttl: 60 }), { dados: 'linhas', doCache: false });
    assert.equal(tentativas, 2);
  });
});
