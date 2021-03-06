#ifndef OSCAR_WEB_ITEM_DB_H
#define OSCAR_WEB_ITEM_DB_H
#include <cppcms/application.h>

#include "ItemSerializer.h"

namespace oscar_web {
/**

An Item is represented by the following json spec
{
	id:int, //internal id
	osmid: int, //osm id
	bbox: [minlat, maxlat, minlon, maxlon], //bounding box, coords in wgs84 double
	shape: {}, //the shape (see definition for shape)
	k: [], //array of keys
	v: [] // and their values
}

The shape has multiple representations depending on the type, all have the type property in common:
{
	t: int, //see sserialize::spatial::GeoShapeType for their definitions, -1 if shape writing was not requested
	v: V //type dependend value
}

sserialize::spatial::GS_POINT:
V=[lat, lon]

sserialize::spatial::GS_WAY/sserialize::spatial::GS_POLYGON:
V=[[lat, lon][lat, lon]] //array of points

sserialize::spatial::GS_MULTIPOLYGON:
V={inner: [[]], outer: [[]]} //object with inner and outer polygons where inner polygons cut out a region of outer polygons

*/
class ItemDB: public cppcms::application {
private:
	liboscar::Static::OsmKeyValueObjectStore m_store;
	uint32_t m_maxPerRequest;
	ItemSerializer m_serializer;
private:
	void writeHeader(std::ostream& out, oscar_web::ItemSerializer::SerializationFormat sf);
	void writeFooter(std::ostream& out, oscar_web::ItemSerializer::SerializationFormat sf);
	void writeSingleItem(std::ostream& out, uint32_t id, oscar_web::ItemSerializer::SerializationFormat sf);
	template<typename T_IT>
	void writeMultiple(std::ostream & out, T_IT begin, T_IT end, oscar_web::ItemSerializer::SerializationFormat sf);
public:
	ItemDB(cppcms::service & srv, const liboscar::Static::OsmKeyValueObjectStore & store);
	inline void setMaxPerRequest(uint32_t v) { m_maxPerRequest = v; }
	inline uint32_t maxPerRequest() const { return m_maxPerRequest; }
	virtual ~ItemDB();
	///returns a single item, call with get and variables
	///format=(oscar|geojson)
	///shape=(true|false)
	void single(std::string num);
	///returns an array of items,
	///call with POST and variable
	///which=[int, int] json array of requested items
	///shape=(true|false)
	///format=(oscar|geojson)
	void multiple();
	///returns an object of shapes { itemid : shape}
	///call with POST and variables
	///which=[int, int] json array of requested itemids
	///format=(oscar|geojson)
	void multipleShapes();
	///returns an array of item-names, call with POST and variable which=[int, int] json array of requested items
	void multipleNames();
	void itemCells(std::string cellIdStr);
	void cellParents(std::string cellIdStr);
	void itemParents(std::string itemIdStr);
	///item has inherited tags from these regions
	void itemRelatives(std::string itemIdStr);
	
	///boundary of cells, call with post and variable which=[int]
	///Returns { cellId : [minLat, maxLat, minLon, maxLon]}
	void cellInfo();
};


template<typename T_IT>
void ItemDB::writeMultiple(std::ostream& out, T_IT begin, T_IT end, oscar_web::ItemSerializer::SerializationFormat sf) {
	uint32_t size = end-begin;
	if (!size) {
		return;
	}
	if (size > m_maxPerRequest) {
		size = m_maxPerRequest;
	}
	writeSingleItem(out, *begin, sf);
	 ++begin;
	for(uint32_t i(1); i < size; ++i, ++begin) {
		out << ",";
		writeSingleItem(out, *begin, sf);
	}
}

}//end namespace

#endif