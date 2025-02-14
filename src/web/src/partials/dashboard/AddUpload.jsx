import { useRef, React } from "react";

function AddUpload(props) {
  const fileInput = useRef(null);

  const selectFile = async () => {
    try {
      let file = fileInput.current.files[0];
      if(! props.prepare(file) ) {
        throw `File structure of ${file.name} does not match one of the supported services.`;
      }
      fileInput.value = ''; //!=null
    } catch (error) {
      alert(error);
    }
  };

  return (
    <div className="flex flex-wrap flex-row col-span-full m:col-span-3 xl:col-span-3 bg-white shadow-lg px-5 pt-5 rounded-xl border border-slate-200">
      <header className="flex flex-auto justify-between items-start mb-7">
        <h2 className="text-lg font-semibold text-slate-800">
          {props.title}
        </h2>
      </header>
      <div className="grid place-content-center mb-4">
        <input
          type="file"
          ref={fileInput}
          onChange={selectFile}
          className="w-full text-sm text-slate-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-primary-50 file:text-primary-700
                hover:file:bg-primary-100
                "
        />
      </div>
    </div>
  );
}

export default AddUpload;
