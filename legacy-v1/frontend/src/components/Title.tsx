import React from 'react';
import cyberKitty from '../assets/cyberkitty-nb-small.png';

const Title: React.FC = () => {
  return (
    <div className="logo"><img className="logo" src={cyberKitty} />
      <h1>
        CyberKitty
      </h1>
    </div>
  );
};

export default Title;
