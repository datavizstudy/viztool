import { useRef, React } from "react";

function FileUpload(props) {
  const fileInput = useRef(null);

  return (
    <div className="flex flex-wrap flex-row col-span-full m:col-span-3 xl:col-span-3 bg-white shadow-lg px-5 pt-5 rounded-xl border border-slate-200">
      <header className="flex flex-auto justify-between items-start w-full mb-7">
        <h2 className="text-lg font-semibold text-slate-800 truncate data-export-filename">
          {props.title}
        </h2>
      </header>
      <div className="grid place-content-end w-full mb-4">
        <input
          type="button"
          value="Delete"
          id={props.id}
          onClick={ () => props.delete(props.id) }
          className="w-full text-sm text-slate-500 mr-4 py-2 px-4
                rounded-full border-0 text-sm font-semibold
                bg-red-50 text-red-700 hover:bg-red-100"
          />
      </div>
    </div>
  );
}

export default FileUpload;
