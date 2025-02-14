// helper methods for recording

import env from './env.json';
import {Base64} from 'js-base64'; // preinstalled by npmjs.com/cimice

export function pushRecording(recorder, movieList, privateSelector = env.recordingExcludeSelector ?? false) {
 recorder.stopRecording();

 if(privateSelector) {
  // remove sensitive classes and override movie scene
  const target = recorder.tryGetTarget().cloneNode(true);
  target.querySelectorAll(privateSelector).forEach(node => {
	if(node.classList.contains('plotly') && node.classList.contains('plot-container')) {

	 const placeholder = document.createElement('div');
	 placeholder.style.background = '#CCC';
	 placeholder.style.height = '100%';
	 placeholder.style.padding = '2em';
	 placeholder.innerHTML = Object.entries(JSON.parse(
		node.parentNode.parentNode.parentNode.dataset.info ?? "{}"
	 )).map(([k,v])=>
		k.replace(/[A-Z]/g, ' $&').replace(/^./, l => l.toUpperCase())
		+ ': ' + v
	 ).join('<br>');
	 node.replaceWith(placeholder);

	} else {
	 node.innerHTML = '';
	 node.style.borderRadius = '.2em';
	 node.style.minWidth = '4em';
	 node.style.height = '1em';
	 node.style.background = '#CCC';
	 node.style.display = 'inline-block';
	}
  });

  // @see github.com/artf/cimice/blob/master/src/components/Recorder.js#L141
  recorder.getMovie().scene = Base64.encode(target.innerHTML);
 }

 movieList.push(recorder.getMovie().toJSON());
}
