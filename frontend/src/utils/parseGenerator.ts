import {PartialEvent, ParsedEvent, ReconnectInterval} from '../utils/eventTypes';
import {createParser, streamAsyncIterator} from '../utils/parseStream';


export async function parseGenerator(url: string, chunksCallback: (chunk: [string, string][]) => void, finalCallback: (parsedData: any) => void) {

  let chunks: [string, string][] = [['', '']];


  function onParse(event: ParsedEvent | ReconnectInterval | PartialEvent) {
    if (event.type === 'event' && event.event === 'result') {
      console.log("Caught result event", event.data);
      const parsedData = JSON.parse(event.data);
      finalCallback(parsedData);
      chunksCallback([['', '']]);
    } else if (event.type === 'event' && event.event === 'mid_point') {
      //parse midpoint event
      console.log("midpoint", event.data);
      // if we're on the null starting chunk, don't push another.
      if (!(chunks[chunks.length - 1][0] === "" && chunks[chunks.length - 1][1] === "")) {
        chunks.push(["", ""]);
      }
      chunks[chunks.length - 1][0] = event.data;

      chunksCallback(chunks.map(str => [str[0], str[1].replaceAll("%0A", "\n")]));
    } else if (event.type === 'partial' && event.event === "chunks") {
      chunks[chunks.length - 1][1] = chunks[chunks.length - 1][1] + event.data;
      // const unencoded = event.data.replace("%0A", "\n");
      chunksCallback(chunks.map(str => [str[0], str[1].replaceAll("%0A", "\n")]));

    } else {
      console.log("unhandled event ii", event);
    }
  };

  const response = await fetch(url)

  if (response.body === null) {
    throw new Error('Response body is undefined');
  }

  const parser = createParser(onParse);
  for await (const chunk of streamAsyncIterator(response.body)) {
    if (chunk !== undefined) {
      parser.feed(chunk);
    }
  }

}

