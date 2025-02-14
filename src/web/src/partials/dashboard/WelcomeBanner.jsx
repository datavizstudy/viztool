import React from "react";

function WelcomeBanner(props) {
  return (
    <div className="relative bg-slate-200 p-4 sm:p-6 rounded-lg overflow-hidden mb-8">
      <div className="relative">
        <h1 className="text-2xl md:text-3xl text-slate-800 font-bold mb-1">
          Welcome
        </h1>
        {props.children}
      </div>
    </div>
  );
}

export default WelcomeBanner;
