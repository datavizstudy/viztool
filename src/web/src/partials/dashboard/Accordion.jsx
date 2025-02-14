import { React } from "react";

function Accordion(props) {
  return (
    <details className={"mt-2 [&_summary]:open:mb-2 " + (props.className ?? props.class ?? '')}
        {...(props.onToggle ? {onToggle:props.onToggle} : {})}
        {...(props.open ? {open:"true"} : {})}
        {...(props.id ? {id:props.id} : {})}>
      <summary className={"list-outside cursor-pointer" + (props.border ? "pb-2 border-b border-slate-300 border-solid" : "")}>{ props.title ?? 'Details' }</summary>
      <div {...props.bodyAttributes}>
        { props.children }
      </div>
    </details>
  );
}

export default Accordion;
