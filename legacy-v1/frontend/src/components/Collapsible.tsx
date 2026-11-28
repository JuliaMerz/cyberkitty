import React, {useState} from 'react';
import {useCollapse} from 'react-collapsed';
import {FiChevronDown, FiChevronRight} from "react-icons/fi";

type CollapsibleProps = {
  children: React.ReactNode;
  title: React.ReactNode | string;
  level: number;
};

const Collapsible: React.FC<CollapsibleProps> = ({children, title, level}) => {
  const {getCollapseProps, getToggleProps, isExpanded} = useCollapse();

  const getTitle = (level: number) => {
    if (typeof title !== 'string') {

      return <div className="collapsible-title" {...getToggleProps()}>{isExpanded ? <FiChevronDown /> : <FiChevronRight />} {title}</div>;
    }
    switch (level) {
      case 1:
        return <div className="collapsible-title">{isExpanded ? <FiChevronDown /> : <FiChevronRight />}<h1 {...getToggleProps()}>{title}</h1></div >;
      case 2:
        return <div className="collapsible-title">{isExpanded ? <FiChevronDown /> : <FiChevronRight />}<h2 {...getToggleProps()}>{title}</h2></div>;
      case 3:
        return <div className="collapsible-title">{isExpanded ? <FiChevronDown /> : <FiChevronRight />}<h3 {...getToggleProps()}>{title}</h3></div>;
      case 4:
        return <div className="collapsible-title">{isExpanded ? <FiChevronDown /> : <FiChevronRight />}<h4 {...getToggleProps()}>{title}</h4></div>;
      case 5:
        return <div className="collapsible-title">{isExpanded ? <FiChevronDown /> : <FiChevronRight />}<h5 {...getToggleProps()}>{title}</h5></div>;
      case 6:
        return <div className="collapsible-title">{isExpanded ? <FiChevronDown /> : <FiChevronRight />}<h6 {...getToggleProps()}>{title}</h6></div>;
      default:
        return <div className="collapsible-title">{isExpanded ? <FiChevronDown /> : <FiChevronRight />}<h4 {...getToggleProps()}>{title}</h4></div>;
    }
  }


  return (
    <div className="collapsible">
      {getTitle(level)}
      {isExpanded && <div {...getCollapseProps()}>{children}</div>}
    </div>
  );
}

export default Collapsible;
