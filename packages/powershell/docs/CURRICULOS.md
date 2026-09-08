# Currículos e aderência

Mantenha cada variante com nome descritivo, como `curriculo-backend.pdf` e `curriculo-fullstack.pdf`. Nunca altere fatos para aproximar o currículo da vaga.

```powershell
.\scripts\extrair-curriculo.ps1 -Path .\curriculo\curriculo-backend.docx
.\scripts\selecionar-curriculo.ps1 -JobDescription 'Descrição integral da vaga'
```

A pontuação automática é uma triagem lexical, não prova de qualificação. O agente deve conferir requisitos eliminatórios, senioridade, local, contrato e salário. Registre qual arquivo foi anexado em cada candidatura.
