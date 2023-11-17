export {}

// import type {EventSourceParser, ParsedEvent} from './eventTypes'
// import {createParser} from './parseStream'

// /**
//  * A TransformStream that ingests a stream of strings and produces a stream of ParsedEvents.
//  *
//  * @example
//  * ```
//  * const eventStream =
//  *   response.body
//  *     .pipeThrough(new TextDecoderStream())
//  *     .pipeThrough(new EventSourceParserStream())
//  * ```
//  * @public
//  */
// export class EventSourceParserStream extends TransformStream<string, ParsedEvent> {
//   constructor(onParse: EventSourceParser) {
//     let parser!: EventSourceParser

//     //  Old
//     //  (event) => {
//     //           if (event.type === 'event' || event.type === 'partial') {
//     //             controller.enqueue(event)
//     //           }
//     //         }
//     super({
//       start(controller) {
//         parser = createParser(onParse)
//       },
//       transform(chunk) {
//         parser.feed(chunk)
//       },
//     })
//   }
// }

// export type {ParsedEvent} from './eventTypes'
