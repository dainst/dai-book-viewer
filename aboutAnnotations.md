# Annotations as queries


What are annotations? Of course we can understand every single annotation as a single instance.
It would have the following four components

- annotation-position 					(<term>, <page>)

	"coordinates" to mark the annotation is what string is to match and on which page...
	in a future version there could be also the opportunity to define XY-coordinates on a page as Topoi does

- data 									(<references>, <other>)

	other may be geographical coordinates or such

- identification						(<ID>)

	necessary for connection with identical annotations
	The <lemma> would not be enough to identify identical annotations. Let's assume a Text refers to the two Frankfurts and the NLP-Pipeline 
	or a human editor disambiguates them correctly, both Annotations have to be shown as distinguished entities in the sidebar and statistics!

- data required for label / statistics	(<lemma>)



## What's the problem with that?

Let's assume a Text about a single thing, let's say about Hadrian which mention him 250 times. In the above format
it would quite an amount of data to transport all of this annotations, even if they all the same id, the same references and so on.

On the other side, when displaying the annotation, we you the find function of pdf.js, which find every occurrence on a page at once.

## The solution

So let's understand our annotation as a search query an encode it like this:

- annotation-positions					(<terms>, <pages>)

	Noe we have a varity of Terms, like stemmed forms etc. and a list of pages where to find them

- data									(<references>, <other>)
- identification						(<ID>)
- data required for label / statistics	(<count>, <lemma>)
	
	We need now a information of how often this specific annotation occurs in the document. Thats necessary for statistics or even the sidebar,
	because that appears long before the occurrences are actually found in the text (which would be necessary for the frontend to count them).

**Example:**

	{
	"persons":
		[
		
		    {
		    	"terms":	["Hadrian", "Hadrians", "Hadrianus"],
		    	"lemma": "Hadrian",
		    	"id": "5770dffb2dc30a7433c729f7",
		    	"pages": [2, 3],
		    	"count": 250, 
		    	"references": [
		    		{"url": "https://de.wikipedia.org/wiki/Hadrian"}
		    	]
		    }
	


	  
# Metadata

known fields

"meta": {

	"annotation_date"			1474472287087
	"annotation_creator"		'NLP Pipeline 1.0'
	"annotation_owner"		'DAI'		
	
	"file_url"					''
	"publication_zenon_id"					''
	
	"publication_language"
	"publication_journal"
	"publication_year"



} 









 