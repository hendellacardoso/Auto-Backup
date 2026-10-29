# Assinatura de código com a SignPath Foundation

O API2Dev Backup é assinado gratuitamente pela [SignPath Foundation](https://signpath.org) (projeto open source, licença MIT).

## 1. Pedido (uma vez)

Formulário em <https://signpath.org/apply>. Requisitos atendidos neste repositório:

- Licença OSI: [MIT](../LICENSE)
- Build verificável: [GitHub Actions](../.github/workflows/release.yml), a partir do código público
- Seção **Code signing policy** e **Privacy policy** no [README](../README.md#code-signing-policy)
- Release publicada em <https://github.com/hendellacardoso/Auto-Backup/releases>
- MFA (autenticação em dois fatores) ativa no GitHub e na SignPath para todos da equipe

## 2. Depois da aprovação (no painel https://app.signpath.io)

1. **Trusted Build Systems:** vincule o **GitHub.com** à organização e instale o app da SignPath no repositório `hendellacardoso/Auto-Backup`.
2. **Projeto:** slug `Auto-Backup`, repositório `https://github.com/hendellacardoso/Auto-Backup`, com o trusted build system GitHub.com.
3. **Artifact configurations** do projeto (cole o conteúdo dos arquivos):
   - slug `app` → [`.signpath/artifact-configurations/app.xml`](../.signpath/artifact-configurations/app.xml)
   - slug `instaladores` → [`.signpath/artifact-configurations/instaladores.xml`](../.signpath/artifact-configurations/instaladores.xml)
4. **Signing policy:** slug `release-signing` (certificado da SignPath Foundation, aprovação manual — você como aprovador).
5. **API token:** crie um usuário de CI (ou token pessoal) com permissão de *Submitter* no projeto.
6. **No GitHub** (Settings → Secrets and variables → Actions):
   - Secret `SIGNPATH_API_TOKEN` = token da SignPath
   - Variable `SIGNPATH_ORGANIZATION_ID` = ID da organização (aparece na URL do painel)

## 3. Publicar uma versão assinada

1. Rode `publicar-release.bat` (informa a versão, envia o código e cria a tag `vX.Y.Z`).
2. O workflow **Release** gera o app, envia `API2Dev Backup.exe` para assinatura e aguarda.
3. Aprove o pedido em <https://app.signpath.io> → *Signing Requests*.
4. O workflow gera o instalador e o portátil com o app assinado e envia um segundo pedido — aprove também.
5. A release é publicada com os `.exe` assinados e o `SHA256SUMS.txt`.

Sem o secret `SIGNPATH_API_TOKEN`, o mesmo workflow publica os executáveis **sem assinatura** (usado para a primeira release, exigida no pedido).
