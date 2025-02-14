import { React } from "react";

function Card(props) {
  return (
    <div className={"flex flex-col h-80 2xl:h-96 bg-white shadow-lg rounded-lg border border-slate-200 overflow-hidden col-span-full" + (props.full ? '' : " lg:col-span-6 2xl:col-span-4")} data-info={props.info}>
      { props.title ? (
        <header className="px-5 py-4 border-b border-slate-100">
          { props.descriptionMode == 2 && props.description ?
            <button className="text-slate-500 float-end"
              onClick={_ => alert(props.description)}
              >?</button> : '' }
	  <h2 className="font-semibold text-slate-800">{props.title}</h2>
	</header>
       ) : ''}
       { props.descriptionMode == 1 && props.description ?
         <small className="px-5 py-2 text-slate-500 italic border-b border-slate-100 whitespace-pre-wrap">{props.description}</small> : '' }
       <div className={ "h-full " + (props.scroll ? 'overflow-scroll' : 'overflow-hidden') }>
         { props.children }
       </div>
     </div>
  );
}

export default Card;
