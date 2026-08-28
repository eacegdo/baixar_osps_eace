/**
 * Semáforo simples. O limite de requisições em voo precisa ser global: com um
 * limite por tabela, baixar 5 tabelas em paralelo multiplicaria a carga no
 * Bubble por 5 e o ganho desaparece.
 */
export class Pool {
  constructor(limite) {
    this.limite = Math.max(1, limite);
    this.emVoo = 0;
    this.fila = [];
  }

  async run(tarefa) {
    if (this.emVoo >= this.limite) {
      await new Promise((resolve) => this.fila.push(resolve));
    }
    this.emVoo += 1;
    try {
      return await tarefa();
    } finally {
      this.emVoo -= 1;
      this.fila.shift()?.();
    }
  }
}
