import React from 'react';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <span className="site-footer__name">Adamas University</span>
          <span aria-hidden="true">•</span>
          <span>Online Examination System</span>
        </div>

        <div className="site-footer__meta">
          <span>Department of Computer Science &amp; Engineering</span>
          <span>© {currentYear}</span>
        </div>
      </div>
    </footer>
  );
};
