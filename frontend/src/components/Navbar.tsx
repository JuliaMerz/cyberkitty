import React from 'react';
import {NavLink} from 'react-router-dom';

const Navbar: React.FC = () => {
  return (
    <div>
      <div className="nav-links">
        <NavLink to="/" className="">
          Home
        </NavLink>
        {/* <NavLink to="/projects" className=""> */}
        {/*   Projects */}
        {/* </NavLink> */}
        {/* <NavLink to="/essays" className=""> */}
        {/*   Blog */}
        {/* </NavLink> */}
        {/* <NavLink to="/hire-me" className=""> */}
        {/*   Hire Me */}
        {/* </NavLink> */}
      </div>
    </div>
  );
};

export default Navbar;
      // <img
      //   className="profile-pic"
      //   src="https://via.placeholder.com/150"
      //   alt="Profile"
      // />
