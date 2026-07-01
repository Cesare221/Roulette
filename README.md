# Roleta de Decisão

Aplicação em React + Vite para escolher opções de forma rápida, visual e divertida.

## O que ela faz

- Adiciona, remove e limpa opções
- Gira uma roleta com animação
- Mantém histórico de resultados
- Importa listas por linha ou por `;`
- Exporta as opções como arquivo `.txt` e copia a lista para a área de transferência
- Embaralha a lista antes do sorteio
- Salva opções, histórico e tema no `localStorage`
- Respeita `prefers-reduced-motion`

## Diferenciais para portfólio

- Interface com hierarquia visual mais forte
- Layout responsivo
- Feedbacks claros de ação e estado
- Presets prontos para uso
- Testes automatizados com Vitest e Testing Library

## Como executar

```bash
npm install
npm run dev
```

## Como validar

```bash
npm test
npm run build
```

## Deploy

O projeto está pronto para deploy em Vercel com as configurações padrão do Vite.

1. Envie o repositório para o GitHub.
2. Importe o projeto na Vercel.
3. Use:
   - Build Command: `npm run build`
   - Output Directory: `dist`

## Ideia de uso

Use esta roleta para decidir refeições, filmes, tarefas rápidas, temas de reunião ou qualquer cenário onde uma escolha aleatória ajude a destravar a próxima ação.
