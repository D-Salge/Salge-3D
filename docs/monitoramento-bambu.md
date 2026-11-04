# Monitoramento local da Bambu Lab P2S

O ERP acompanha a impressão pela rede local e mantém o uso normal do Bambu Handy e do Bambu Studio. O conector só assina o tópico de relatórios MQTT: não envia arquivos, não inicia, pausa ou cancela impressões e não muda temperaturas.

## Configurar no computador do ERP

1. Atualize o ERP, execute `npm ci`, `npm run build` e inicie com `npm start -- -p 3002`.
2. Mantenha o PC e a P2S na mesma rede, com acesso entre os dispositivos. Redes de convidados podem bloquear essa comunicação.
3. Consulte o **IPv4 local**, o **número de série** e o **código de acesso local de 8 caracteres** nas configurações da P2S/Bambu Studio. O número de série não é o nome `3DP-...`. Não use a senha da conta Bambu.
4. Entre como administrador no ERP e abra **Impressoras → Conectar impressora**. Selecione o cadastro da P2S e preencha os três dados. O mesmo painel aparece em Produção.
5. Salve. “Configuração salva” confirma somente o cadastro. Aguarde **Ao vivo** e confira o progresso e as temperaturas com a tela da impressora. Esse é o teste da conexão real.

Não ative LAN Only ou modo desenvolvedor para tentar contornar um erro. A opção LAN Only interrompe o Bambu Handy. O acesso de leitura depende do firmware e das permissões que a P2S disponibiliza; se houver recusa, registre a mensagem do painel e a versão do firmware para diagnosticar mantendo a conexão atual. Não faça downgrade para esta integração.

O conector usa MQTT/TLS na porta 8883 com autenticação local, validação dos certificados públicos Bambu e identidade do número de série. O TLS está limitado à versão 1.2 para compatibilidade com a P2S. Não há opção para ignorar a validação de certificado nem necessidade de abrir portas do roteador para a internet.

## Dados e atualização

- Estado da impressão, progresso, tempo restante, camada, arquivo e temperaturas do bico, mesa e câmara, quando informados pelo firmware.
- Campos não recebidos aparecem como `—`; zeros enviados pela máquina são preservados.
- O navegador consulta o ERP a cada 5 segundos enquanto a página está visível. O servidor mantém a assinatura MQTT e tenta reconectar a cada 15 segundos em falhas de rede.
- Após 90 segundos sem relatório novo, os dados deixam de ser identificados como atuais. Mensagens MQTT retidas não são usadas como prova de uma impressão atual.
- Sem acesso ao painel por dois minutos, a conexão pode ser encerrada para economizar recursos e é aberta novamente ao retornar. O PC e o servidor do ERP precisam estar ligados.
- Esta versão não consulta a nuvem Bambu, não solicita senha da conta nem inclui câmera/AMS ou comandos de controle.

## Vincular ao pedido e à plate

1. Em **Produção → Lotes e plates**, organize o pedido por plate/lote. Para dividir um pedido entre P2S e A1 mini, use lotes separados.
2. Com dados atuais e uma impressão ativa, clique em **Vincular plate** no monitoramento.
3. Selecione um lote ativo atribuído à mesma impressora (ou ainda sem máquina) e identifique a plate/execução, por exemplo `Tampas · Plate 2 · Execução 1`.

O vínculo é explícito e não tenta adivinhar pedidos pelo nome do arquivo. Uma nova impressão, reconexão ou reinício do servidor exige confirmar novamente o vínculo. O vínculo anterior pode continuar visível como referência, mas não será identificado como ativo.

Terminar uma plate não conclui o pedido. A conclusão, as peças aprovadas, os consumos reais, os custos e o estoque continuam pelo fluxo de conferência existente. O monitor não incrementa quantidades nem executa baixas.

## Credenciais e restauração

Somente administradores configuram/desativam conexões. Administradores e operadores vinculam plates; visualizadores acompanham os dados. Todas as consultas e alterações do conector usam a empresa da sessão autenticada.

O código de acesso é cifrado no SQLite com AES-256-GCM e uma chave aleatória mantida em `segredos-locais/bambu.key`, ao lado do banco configurado. A chave não é enviada ao navegador nem versionada. A auditoria não inclui código, senha ou payload MQTT. Ao editar a conexão, o campo do código fica vazio; deixá-lo vazio mantém o código anterior se o número de série for o mesmo.

O backup SQLite não contém a chave local. Ao restaurar em outro computador sem essa pasta, informe novamente o código de acesso no painel. Pedidos e estoque não dependem dessa chave. A migração 34 usa o mecanismo existente de snapshot e validação de backup antes de modificar um banco já existente.

## Referências de compatibilidade

- Bambu Lab: [operações de monitoramento e autorização](https://blog.bambulab.com/firmware-update-introducing-new-authorization-control-system-2/).
- Bambu Lab: [rede local e Bambu Handy](https://cdn1.bambulab.com/trust-center/file/bambulab-security-whitepaper-en.pdf).
- Projeto ha-bambulab: [configuração local e campos necessários](https://github.com/greghesp/ha-bambulab/blob/main/docs/setup.mdx).
- Campos do relatório P2S e certificados públicos conferidos com os artefatos de referência do [ha-bambulab](https://github.com/greghesp/ha-bambulab/tree/main/custom_components/bambu_lab/pybambu). O conector do ERP é independente e somente de leitura.

Os testes automatizados usam transporte simulado e bancos descartáveis. Eles não substituem o teste com a P2S, seu firmware e sua rede.
