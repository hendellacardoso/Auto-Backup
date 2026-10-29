# Página de apresentação — API2Dev Backup

Página estática (somente **HTML + CSS + JavaScript**, sem dependências e sem servidor obrigatório).
Pode ser aberta direto no navegador (`index.html`) ou publicada em qualquer hospedagem/pasta, por exemplo `https://api2dev.com.br/backup/`.

```
publicacao/
  index.html          página
  css/estilo.css      estilos (responsivo)
  js/telas.js         lista das telas (título, grupo e descrição)
  js/app.js           menu, visor de telas, tela cheia, abas do "Como usar"
  img/icone.png       ícone do sistema
  img/favicon.png
  img/banner.png      imagem de compartilhamento (og:image)
  img/prints/*.webp   prints das telas
```

## Visor de telas

- Setas, miniaturas, botões por área (Painel, Conexões, Tarefas, Histórico, Configurações, Sobre).
- Teclado ← → quando o visor está na tela; deslizar o dedo no celular.
- Clique na imagem para tela cheia (Esc fecha).
- Link direto para uma tela: `index.html#tela-06-historico`.
- Os botões "Ver tela" do passo a passo abrem a tela correspondente.

## Adicionar ou trocar uma tela

1. Salve a imagem em `img/prints/` no formato `.webp` (ex.: `14-nova-tela.webp`, 1440×900).
2. Inclua um item em `js/telas.js`:
   ```js
   { id: '14-nova-tela', grupo: 'Tarefas', titulo: 'Nova tela', descricao: 'O que ela mostra.' }
   ```

Todos os caminhos são relativos, então a pasta funciona em qualquer endereço.
