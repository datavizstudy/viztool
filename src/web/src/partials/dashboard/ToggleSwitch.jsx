import { React } from "react";

/**
 * @license github.com/themesberg/flowbite/blob/main/LICENSE.md
 * `flowbite-react` has several bugs
 * - toggleSwitch: blue = cyan, @see https://github.com/themesberg/flowbite-react/blob/main/src/components/ToggleSwitch/theme.ts#L18C1-L18C46
 * - changes styles of input[type=file]
 */
function ToggleSwitch(props) {
  return (
    <label className="relative inline-flex items-center cursor-pointer w-fit">
      <input
        type="checkbox"
        className="sr-only peer"
        defaultChecked={props.checked}
        onChange={ event => props.onChange(event.target.checked) }
        />
      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
      { props.label ? (
        <span className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">{props.label}</span>
      ) : '' }
    </label>
  );
}

export default ToggleSwitch;
