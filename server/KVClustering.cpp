#include "KVClustering.h"
#include "helpers.h"
#include <cppcms/http_response.h>
#include <cppcms/http_request.h>
#include <cppcms/url_dispatcher.h>
#include <cppcms/url_mapper.h>

namespace oscar_web {


    KVClustering::KVClustering(cppcms::service &srv, const CompletionFileDataPtr &dataPtr) :
            cppcms::application(srv),
            m_dataPtr(dataPtr) {
        dispatcher().assign("/get", &KVClustering::get, this);
        mapper().assign("get", "/get");
    }

    KVClustering::~KVClustering() = default;

    void KVClustering::get() {
        typedef sserialize::Static::spatial::GeoHierarchy GeoHierarchy;
        typedef liboscar::Static::OsmKeyValueObjectStore OsmKeyValueObjectStore;

        sserialize::TimeMeasurer ttm;
        ttm.begin();

        m_store = m_dataPtr->completer->store();
        const auto &gh = m_store.geoHierarchy();

        response().set_content_header("text/json");


        //params
        std::string cqs = request().get("q");
        std::string regionFilter = request().get("rf");
        std::string format = request().get("format");
        std::string clusteringType = request().get("type");
        std::string queryId = request().get("queryId");
        std::string maxRefinements = request().get("maxRefinements");
        std::string exceptionsString = request().get("exceptions");
        std::string keyExceptions = request().get("keyExceptions");


        bool parsingCorrect = false;

        bool debug = request().get("debug") == "true";

        std::uint8_t mode = 0;
        if (clusteringType == "k")
            mode = 1;
        if (clusteringType == "p")
            mode = 2;

        sserialize::CellQueryResult cqr;
        sserialize::spatial::GeoHierarchySubGraph sg;

        if (m_dataPtr->ghSubSetCreators.count(regionFilter)) {
            sg = m_dataPtr->ghSubSetCreators.at(regionFilter);
        } else {
            sg = m_dataPtr->completer->ghsg();
        }
        cqr = m_dataPtr->completer->cqrComplete(cqs, sg, m_dataPtr->treedCQR);
        uint32_t itemCount = cqr.maxItems();


        std::ostream &out = response().out();

        auto numberOfRefinements = static_cast<uint32_t>(std::stoi(maxRefinements));

        std::stringstream debugStr;

        debugStr << R"(,"debugInfo":{"itemCount":)" << itemCount;

        std::vector<std::pair<sserialize::SizeType, sserialize::SizeType >> keyExceptionRanges;

        auto subSet = sg.subSet(cqr, false, 1);

        if (mode < 2) {

            std::vector<std::string> prefixKeyExceptions = parseJsonArray<std::string>(keyExceptions, parsingCorrect);

            debugStr << R"(,"parsingCorrect":")" << parsingCorrect << '"';

            auto kt = m_store.keyStringTable();

            for (const auto &prefixException : prefixKeyExceptions) {
                keyExceptionRanges.emplace_back(kt.range(prefixException));
            }

            if (mode == 0) {

                std::set<std::pair<uint32_t, uint32_t >> exceptions;

                std::vector<std::vector<uint32_t >> exceptionsVecs = parseJsonArray<std::vector<uint32_t >>(
                        exceptionsString, parsingCorrect);

                for (auto &exceptionVec: exceptionsVecs) {
                    exceptions.insert(std::make_pair(exceptionVec[0], exceptionVec[1]));
                }

                std::unordered_map<std::pair<std::uint32_t, std::uint32_t>, std::vector<uint32_t>> keyValueItemMap;

                generateKeyItemMap(keyValueItemMap, cqr, debugStr, exceptions, keyExceptionRanges);

                std::vector<std::pair<std::pair<std::uint32_t, std::uint32_t>, std::uint32_t >> keyValueItemVec;

                sortMap(keyValueItemMap, keyValueItemVec, debugStr);

                writeParentsWithNoIntersection(out, keyValueItemMap, keyValueItemVec, mode, numberOfRefinements,
                                               debugStr, subSet);


            } else {
                std::vector<uint32_t> exceptions = parseJsonArray<uint32_t>(exceptionsString, parsingCorrect);

                std::set<uint32_t> exceptionsSet;

                for (auto &exception : exceptions) {
                    exceptionsSet.insert(exception);
                }

                std::unordered_map<std::uint32_t, std::vector<uint32_t>> keyItemMap;

                generateKeyItemMap(keyItemMap, cqr, debugStr, exceptionsSet, keyExceptionRanges);

                std::vector<std::pair<std::uint32_t, uint32_t>> keyItemVec;

                sortMap(keyItemMap, keyItemVec, debugStr);

                writeParentsWithNoIntersection(out, keyItemMap, keyItemVec, mode, numberOfRefinements, debugStr,
                                               subSet);

            }

        } else {
            sserialize::TimeMeasurer gtm;
            gtm.begin();
            std::unordered_map<std::uint32_t, std::vector<uint32_t>> parentItemMap;
            std::vector<std::pair<std::uint32_t, std::uint32_t >> parentItemPairVec;

            std::unordered_map<std::uint32_t, std::uint32_t> parentItemCountMap;

            //get all parents and their items

            for (sserialize::CellQueryResult::const_iterator it(cqr.begin()), end(cqr.end()); it != end; ++it) {
                const auto &cellParents = sg.cellParents(it.cellId());
                if (!cellParents.empty()) {
                    for (const uint32_t &cellParent : cellParents) {
                        parentItemCountMap[cellParent] += it.idxSize();
                    }
                }
            }


            gtm.end();

            debugStr << ",\"timeToGenerateMap\":" << gtm.elapsedMilliSeconds();

            //transform parentItemMap to vector and sort descending by number of keys

            sserialize::TimeMeasurer ctm;
            ctm.begin();

            std::vector<std::pair<std::uint32_t, std::uint32_t >> parentItemVec;

            for (const auto &parentItemCountPair : parentItemCountMap) {
                parentItemVec.emplace_back(parentItemCountPair);
            }

            std::sort(parentItemVec.begin(), parentItemVec.end(), [](std::pair<std::uint32_t, std::uint32_t> const &a,
                                                                     std::pair<std::uint32_t, std::uint32_t> const &b) {
                return a.second != b.second ? a.second > b.second : a.first < b.first;
            });

            writeParentsWithNoIntersection(out, parentItemMap, parentItemVec, mode, numberOfRefinements, debugStr,
                                           subSet);


        }

        if (debug) {
            ttm.end();
            debugStr << ",\"totalTime\":" << ttm.elapsedMilliSeconds();
            debugStr << "}";
            out << debugStr.str();
        }

        out << ",\"queryId\":" + queryId + "}";

        ttm.end();
        writeLogStats("get", cqs, ttm, cqr.cellCount(), itemCount);
    }

    void
    KVClustering::writeLogStats(const std::string &fn, const std::string &query, const sserialize::TimeMeasurer &tm,
                                uint32_t cqrSize, uint32_t idxSize) {
        *(m_dataPtr->log) << "KVClustering::" << fn << ": t=" << tm.beginTime() << "s, rip=" << request().remote_addr()
                          << ", q=[" << query << "], rs=" << cqrSize << " is=" << idxSize << ", ct="
                          << tm.elapsedMilliSeconds() << "ms" << std::endl;
    }

    template<typename mapKey>
    void KVClustering::generateKeyItemMap(
            std::unordered_map<mapKey, std::vector<uint32_t>> &keyItemMap,
            const sserialize::CellQueryResult &cqr, std::stringstream &debug, const std::set<mapKey> &exceptions,
            const std::vector<std::pair<sserialize::SizeType, sserialize::SizeType>> &keyExceptionRanges) {
        sserialize::TimeMeasurer gtm;
        gtm.begin();
        //iterate over all query result items
        for (sserialize::CellQueryResult::const_iterator it(cqr.begin()), end(cqr.end()); it != end; ++it) {
            for (const uint32_t &x : it.idx()) {
                const auto &item = m_store.kvBaseItem(x);
                //iterate over all item keys-value items
                for (uint32_t i = 0; i < item.size(); ++i) {
                    //add key and item to key to keyItemMap
                    insertKey(keyItemMap, item, i, exceptions, keyExceptionRanges, x);
                }
            }
        }
        gtm.end();

        debug << ",\"timeToGenerateMap\":" << gtm.elapsedMilliSeconds();

    }

    //returns true if the number of intersections is greater than minNumber
    template<typename It>
    bool KVClustering::hasIntersection(It beginI, It endI, It beginJ, It endJ, const std::float_t &minNumber) {
        std::uint32_t intersectionCount = 0;
        while (beginI != endI && beginJ != endJ) {
            if (*beginI < *beginJ) ++beginI;
            else if (*beginJ < *beginI) ++beginJ;
            else {
                ++beginI;
                ++beginJ;
                if (++intersectionCount > minNumber) {
                    return true;
                };
            }
        }
        return false;
    }


    template<typename mapKey>
    void KVClustering::writeParentsWithNoIntersection(std::ostream &out,
                                                      const std::unordered_map<mapKey, std::vector<std::uint32_t >> &parentItemMap,
                                                      const std::vector<std::pair<mapKey, std::uint32_t >> &parentItemVec,
                                                      const std::uint8_t &mode,
                                                      const uint32_t &numberOfRefinements,
                                                      std::stringstream &debugStr,
                                                      sserialize::Static::spatial::detail::SubSet subSet) {


        //derive startParents BA-Kopf Page 18
        sserialize::TimeMeasurer fptm;
        fptm.begin();


        std::vector<std::pair<mapKey, std::uint32_t >> result;
        auto itI = parentItemVec.begin() + 1;
        bool startParentsFound = false;
        std::float_t maxNumberOfIntersections;
        for (; itI < parentItemVec.end(); ++itI) {
            for (auto itJ = parentItemVec.begin(); itJ < itI; ++itJ) {
                const std::vector<uint32_t> &setI = getSet(((*itI).first), parentItemMap, subSet, mode);
                const std::vector<uint32_t> &setJ = getSet(((*itJ).first), parentItemMap, subSet, mode);

                maxNumberOfIntersections =
                        mode == 2 ? 0 : (setI.size() + setJ.size()) / 200;
                if (!hasIntersection(setI.begin(), setI.end(), setJ.begin(), setJ.end(), maxNumberOfIntersections)) {
                    // no intersection or required amount
                    // add both parents to results
                    result.emplace_back((*itJ).first, (*itJ).second);
                    result.emplace_back((*itI).first, (*itI).second);

                    //end the algorithm
                    startParentsFound = true;
                    break;
                }

            }
            if (startParentsFound)
                break;
        }
        fptm.end();
        debugStr << ",\"timeToFindFirstParents\":" << fptm.elapsedMilliSeconds();

        //get other parents which don't have an intersection with the startParents(BA-Kopf page 19)
        sserialize::TimeMeasurer nptm;
        nptm.begin();
        if (startParentsFound) {
            for (auto itK = itI + 1; itK < parentItemVec.end() && result.size() < numberOfRefinements + 1; ++itK) {
                bool discarded = false;
                for (auto &parentPair : result) {
                    maxNumberOfIntersections =
                            mode == 2 ? 0 : (parentPair.second + (*itK).second) / 200;
                    const std::vector<uint32_t> &setI = getSet((*itK).first, parentItemMap, subSet, mode);
                    const std::vector<uint32_t> &setJ = getSet(parentPair.first, parentItemMap, subSet, mode);

                    if (hasIntersection(setI.begin(), setI.end(), setJ.begin(), setJ.end(), maxNumberOfIntersections)) {
                        discarded = true;
                        break;
                    }
                }
                if (!discarded) {
                    //parent does not intersect with previous found parents; add to results
                    result.emplace_back(*itK);
                }
            }
        }

        nptm.end();

        debugStr << ",\"timeToFindOtherParents\":" << nptm.elapsedMilliSeconds();

        //print results

        out << "{\"clustering\":[";
        auto separator = "";

        bool hasMore = false;
        uint32_t count = 0;

        for (auto &resultPair: result) {
            if (count < numberOfRefinements) {
                out << separator;
                printResult(resultPair.first, resultPair.second, out, mode);
                separator = ",";
            } else {
                hasMore = true;
            }
            ++count;
        }

        out << "]";

        out << ",\"hasMore\":" << std::boolalpha << hasMore;

    }

    void KVClustering::printResult(const std::uint32_t &id, const long &itemCount, std::ostream &out,
                                   const std::uint8_t &mode) {
        const auto &gh = m_store.geoHierarchy();
        sserialize::JsonEscaper je;

        if (mode == 1) {
            out << R"({"name": ")" << je.escape(m_store.keyStringTable().at(id)) << R"(", "itemCount":)" << itemCount
                << ",\"id\":" << id << "}";
        } else if (mode == 2) {
            out << R"({"name": ")" << je.escape(m_store.at(gh.ghIdToStoreId(id)).value("name"))
                << R"(", "itemCount":)" << itemCount
                << ",\"id\":" << id << "}";
        }
    }

    void KVClustering::printResult(const std::pair<std::uint32_t, std::uint32_t> &id, const long &itemCount,
                                   std::ostream &out, const std::uint8_t &mode) {
        sserialize::JsonEscaper je;
        out << R"({"name": ")" << je.escape(m_store.keyStringTable().at(id.first)) << ":"
            << je.escape(m_store.valueStringTable().at(id.second)) << R"(", "itemCount":)" << itemCount
            << ",\"keyId\":" << id.first << ",\"valueId\":" << id.second << "}";
    }

    template<typename mapKey>
    void KVClustering::sortMap(std::unordered_map<mapKey, std::vector<uint32_t>> &parentItemMap,
                               std::vector<std::pair<mapKey, uint32_t>> &parentItemVec,
                               std::stringstream &debug) {

        sserialize::TimeMeasurer stm;
        stm.begin();

        auto parentCount = static_cast<uint32_t>(parentItemMap.size());

        debug << ",\"parentCount\":" << parentCount;

        uint32_t pairCount = 0;


        for (auto &parent : parentItemMap) {
            std::sort(parent.second.begin(), parent.second.end());
            parentItemVec.emplace_back(std::make_pair(parent.first, parent.second.size()));
            pairCount += parent.second.size();
        }
        debug << ",\"pairCount\":" << pairCount;

        std::sort(parentItemVec.begin(), parentItemVec.end(),
                  [](std::pair<mapKey, std::uint32_t> const &a,
                     std::pair<mapKey, std::uint32_t> const &b) {
                      return a.second != b.second ? a.second > b.second : a.first < b.first;
                  });


        stm.end();
        debug << ",\"timeToSort\":" << stm.elapsedMilliSeconds();

    }

    void KVClustering::insertKey(std::unordered_map<std::uint32_t, std::vector<uint32_t>> &keyItemMap,
                                 const liboscar::Static::OsmKeyValueObjectStore::KVItemBase &item, const uint32_t &i,
                                 const std::set<uint32_t> &exceptions,
                                 const std::vector<std::pair<sserialize::SizeType, sserialize::SizeType>> &keyExceptionRanges,
                                 const std::uint32_t itemId) {
        if (exceptions.find(item.keyId(i)) == exceptions.end())
            keyItemMap[item.keyId(i)].emplace_back(itemId);
    }

    void KVClustering::insertKey(
            std::unordered_map<std::pair<std::uint32_t, std::uint32_t>, std::vector<uint32_t>> &keyValueItemMap,
            const liboscar::Static::OsmKeyValueObjectStore::KVItemBase &item, const uint32_t &i,
            const std::set<std::pair<std::uint32_t, std::uint32_t >> &exceptions,
            const std::vector<std::pair<sserialize::SizeType, sserialize::SizeType>> &keyExceptionRanges,
            const std::uint32_t itemId) {
        const std::pair<std::uint32_t, std::uint32_t> &keyValuePair = std::make_pair(item.keyId(i), item.valueId(i));
        if (exceptions.find(keyValuePair) == exceptions.end() && !isException(keyValuePair.first, keyExceptionRanges))
            keyValueItemMap[keyValuePair].emplace_back(itemId);
    }

    bool KVClustering::isException(const std::uint32_t &key,
                                   const std::vector<std::pair<sserialize::SizeType, sserialize::SizeType>> &keyExceptionRanges) {
        for (const auto &exceptionRange : keyExceptionRanges) {
            if (key >= exceptionRange.first && key <= exceptionRange.second) {
                return true;
            }
        }
        return false;
    }

    std::vector<uint32_t> KVClustering::getSet(const std::pair<std::uint32_t, std::uint32_t> &id,
                                               const std::unordered_map<std::pair<std::uint32_t, std::uint32_t>, std::vector<uint32_t>> &map,
                                               const sserialize::Static::spatial::detail::SubSet &subSet,
                                               const uint8_t &mode) {
        return map.at(id);
    }

    std::vector<uint32_t>
    KVClustering::getSet(const uint32_t &id, const std::unordered_map<uint32_t, std::vector<uint32_t >> &map,
                         const sserialize::Static::spatial::detail::SubSet &subSet, const uint8_t &mode) {
        if (mode < 2) {
            return map.at(id);
        } else {
            const auto &gh = m_store.geoHierarchy();
            return subSet.regionByStoreId(gh.ghIdToStoreId(id))->cellPositions();
        }
    }


}//end namespace oscar_web
