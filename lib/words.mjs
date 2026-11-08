// A small built-in list of common English words. The name detector treats a capitalized token
// as a possible person's name only when it is not one of these (or a simple inflection of one).
// It is built in, not read from the system dictionary, so the self-test numbers are the same on
// every machine. When your own summaries trip on an ordinary word, add the word here; when they
// trip on a real name that is fine in context, add it to that case's names_allow_extra.
const LIST = `
a about above across action actions add added after again against agenda agree agreed ahead all
also always am among an and another answer any anyone anything april are around as ask asked at
august away back bad bakery be because been before behind being below best better between big
bill board both box break bring brought budget build but buy by call called calls can cannot card
cash change check checked chair city clean client close closed coffee cold come comes cost could
count cover customer customers day days december deliver delivery deposit did do does done door
down draft due during each early east end enough even evening every february few file final
find first fix floor follow for four friday from front full get give go going good great had half
has have he her here high him his hold home hour hours how i if in inside into invoice is issue it
item items its january job july june just keep kept key kitchen know last late later lead least
leave left less let list little long look lot low made main make march market may me meet meeting
member members menu might money month monday more morning most move much must my need needs never
new next night no none noon north not note notes november now number october of off office old on
once one only open or order orders other our out over own paid part pay people per phone place
plan please point price prices print put quarter question quick quote rain rate read ready reason
recorded rent repair review right room rule run said same saturday say schedule second see send
sent september set shall she shelf ship shop should show side sign since slot small so some soon
south space staff start still stock stop store sunday supplier supply sure table take talk talked
team ten than thank that the their them then there these they thing think this those three
thursday time to today told too took top total tour town truck tuesday two under until up update
us use van vendor very wait walk wall want was water way we wednesday week weekend well went were
west what when where which while who why will window with without work works would yard year yes
yet you your
`;

export const COMMON_WORDS = new Set(LIST.split(/\s+/).filter(Boolean));
