import { useState } from 'react';

const DIARIO_URL = 'https://diario-360-9ux61w.v2.appdeploy.ai/';

export default function Diario360Module() {
  const [failed, setFailed] = useState(false);

  return (
    <section className="diario360-shell">
      <header className="diario360-toolbar">
        <div>
          <span className="eyebrow">GESTÃO 360 • MÓDULO INTEGRADO</span>
          <h1>Diário 360</h1>
          <p>Ambiente oficial do Diário de Obras, conectado à base online já utilizada pela equipe.</p>
        </div>
        <a className="primary-button diario360-open" href={DIARIO_URL} target="_blank" rel="noreferrer">
          Abrir em nova janela ↗
        </a>
      </header>
      <div className="diario360-notice">
        <strong>Base de dados preservada</strong>
        <span>Este módulo abre a aplicação Diário 360 existente. Não cria cópias, não migra registros e não altera o banco de dados atual.</span>
      </div>
      {failed ? (
        <div className="diario360-fallback">
          <h2>O navegador não permitiu exibir o Diário dentro desta janela.</h2>
          <p>Isso pode ocorrer por uma política de segurança do site. Seus dados continuam na aplicação original.</p>
          <a className="primary-button" href={DIARIO_URL} target="_blank" rel="noreferrer">Acessar Diário 360 ↗</a>
        </div>
      ) : (
        <iframe
          className="diario360-frame"
          src={DIARIO_URL}
          title="Diário 360 — Diário de Obras"
          loading="eager"
          allow="camera; geolocation"
          referrerPolicy="strict-origin-when-cross-origin"
          onError={() => setFailed(true)}
        />
      )}
    </section>
  );
}
